from fastapi import (
    FastAPI,
    APIRouter,
    HTTPException,
    UploadFile,
    File,
    Depends,
    Header,
    Query,
)
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import os
import base64
import tempfile
from kubernetes import client, config
from dotenv import load_dotenv

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

# Load .env file from the current directory or parent directory
load_dotenv()
load_dotenv(dotenv_path="../.env")

from google.cloud import aiplatform
from google.cloud import storage
import yaml


def get_project_id():
    project_id = os.environ.get("PROJECT_ID")
    if not project_id:
        raise HTTPException(
            status_code=500, detail="PROJECT_ID environment variable is not set"
        )
    return project_id


def get_input_bucket():
    return os.environ.get("INPUT_BUCKET", f"gs://{get_project_id()}-boltz-inputs")


def get_output_bucket():
    return os.environ.get("OUTPUT_BUCKET", f"gs://{get_project_id()}-boltz-outputs")


app = FastAPI(title="ML HPC Job Submission API")
api_router = APIRouter(prefix="/api")


@app.get("/health", include_in_schema=False)
def health_check():
    """Health check endpoint for GCP Load Balancer. Does not require IAP."""
    return {"status": "healthy"}


async def verify_iap(x_goog_iap_jwt_assertion: str = Header(None)):
    """
    Validates the IAP JWT assertion to ensure the request came through Google Cloud IAP.
    If the header is missing, we allow it for local development, but in a strict
    production setting you'd want to require it. We will require it here for security,
    unless disabled via env var.
    """
    if os.environ.get("DISABLE_IAP_VALIDATION", "false").lower() == "true":
        return None

    if not x_goog_iap_jwt_assertion:
        raise HTTPException(
            status_code=401, detail="Missing X-Goog-IAP-JWT-Assertion header"
        )

    try:
        # Validate the JWT. For audience, we could optionally provide the backend service's expected audience
        # which looks like `/projects/PROJECT_NUMBER/global/backendServices/SERVICE_ID`
        # But even without the audience, verifying it's signed by Google and not expired is good.
        # To be fully secure, you SHOULD check the audience. For simplicity, we just decode and verify signature.
        claim = id_token.verify_token(
            x_goog_iap_jwt_assertion,
            google_requests.Request(),
            certs_url="https://www.gstatic.com/iap/verify/public_key",
        )
        return claim
    except ValueError as e:
        raise HTTPException(status_code=401, detail=f"Invalid IAP JWT: {e}")


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load Kubernetes configuration based on environment
try:
    if os.environ.get("KUBERNETES_PORT"):
        config.load_incluster_config()
    else:
        config.load_kube_config()
    k8s_batch_v1 = client.BatchV1Api()
    k8s_core_v1 = client.CoreV1Api()
except Exception as e:
    print(f"Failed to load K8s config: {e}")
    k8s_batch_v1 = None
    k8s_core_v1 = None


class PredictionRequest(BaseModel):
    model_name: str  # Only 'boltz-2' is supported right now
    input_file: str  # E.g., 'inputs.fasta' (relative to input bucket)
    config_file: str | None = None  # Optional YAML config file path


class PredictionResponse(BaseModel):
    job_id: str
    message: str


@api_router.post("/upload", dependencies=[Depends(verify_iap)])
async def upload_file(file: UploadFile = File(...)):
    """
    Uploads a FASTA file to the input bucket
    """
    input_bucket = get_input_bucket()
    bucket_name = input_bucket.replace("gs://", "").split("/")[0]

    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)

        # Generate a unique prefix for the file
        file_prefix = f"uploads/{uuid.uuid4().hex[:8]}"
        blob_name = f"{file_prefix}/{file.filename}"
        blob = bucket.blob(blob_name)

        # Read file contents and upload
        contents = await file.read()

        if file.filename and file.filename.lower().endswith((".yaml", ".yml")):
            try:
                yaml.safe_load(contents)
            except yaml.YAMLError as e:
                raise HTTPException(
                    status_code=400, detail=f"Invalid YAML file: {str(e)}"
                )

        blob.upload_from_string(contents)

        # We return the FULL blob name here (e.g. 'uploads/a1b2c3d4/C7F6X3.fasta')
        # So that the predict endpoint constructs the GS URI correctly
        return {"filename": blob_name, "message": "File uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@api_router.post(
    "/predict", response_model=PredictionResponse, dependencies=[Depends(verify_iap)]
)
def submit_prediction(request: PredictionRequest):
    if not k8s_batch_v1:
        raise HTTPException(status_code=500, detail="Kubernetes client not configured.")

    if request.model_name.lower() != "boltz-2":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model: {request.model_name}. Only 'boltz-2' is supported.",
        )

    job_id = f"ml-job-boltz-2-{uuid.uuid4().hex[:8]}"
    project_id = get_project_id()
    image = f"gcr.io/{project_id}/boltz-runner:latest"
    output_bucket = get_output_bucket()
    input_bucket = get_input_bucket()

    # Construct full GS URIs
    input_uri = f"{input_bucket}/{request.input_file}"
    output_uri = f"{output_bucket}/outputs/{job_id}/"

    container_command = ["/app/run.sh"]
    container_args = [input_uri, output_uri]

    # Create the Kubernetes Job Manifest
    job = client.V1Job(
        metadata=client.V1ObjectMeta(
            name=job_id,
            labels={
                "kueue.x-k8s.io/queue-name": "ml-user-queue",  # Target the Kueue LocalQueue
                "model": request.model_name,
            },
        ),
        spec=client.V1JobSpec(
            backoff_limit=0,
            ttl_seconds_after_finished=3600,  # Job Garbage Collection
            template=client.V1PodTemplateSpec(
                metadata=client.V1ObjectMeta(labels={"app": "ml-inference"}),
                spec=client.V1PodSpec(
                    restart_policy="Never",
                    service_account_name="ml-job-sa",
                    containers=[
                        client.V1Container(
                            name="predictor",
                            image=image,
                            command=container_command,
                            args=container_args,
                            env=[
                                client.V1EnvVar(
                                    name="NVIDIA_VISIBLE_DEVICES", value="all"
                                ),
                                client.V1EnvVar(
                                    name="NVIDIA_DRIVER_CAPABILITIES",
                                    value="compute,utility",
                                ),
                                client.V1EnvVar(
                                    name="PYTORCH_CUDA_ALLOC_CONF",
                                    value="expandable_segments:True",
                                ),
                            ],
                            resources=client.V1ResourceRequirements(
                                requests={
                                    "cpu": "4",
                                    "memory": "16Gi",
                                    "nvidia.com/gpu": "1",
                                },
                                limits={
                                    "cpu": "4",
                                    "memory": "16Gi",
                                    "nvidia.com/gpu": "1",
                                },
                            ),
                            volume_mounts=[
                                client.V1VolumeMount(name="dshm", mount_path="/dev/shm")
                            ],
                        )
                    ],
                    volumes=[
                        client.V1Volume(
                            name="dshm",
                            empty_dir=client.V1EmptyDirVolumeSource(medium="Memory"),
                        )
                    ],
                    # Need tolerations so it can schedule on the GPU node pool
                    tolerations=[
                        client.V1Toleration(
                            key="nvidia.com/gpu",
                            operator="Equal",
                            value="present",
                            effect="NoSchedule",
                        )
                    ],
                ),
            ),
        ),
    )

    try:
        k8s_batch_v1.create_namespaced_job(namespace="default", body=job)
        return {
            "job_id": job_id,
            "message": f"Successfully queued job for {request.model_name}",
        }
    except client.exceptions.ApiException as e:
        raise HTTPException(status_code=500, detail=f"Failed to create job: {e}")


# --- VERTEX AI PIPELINE IMPLEMENTATION ---
from google.cloud import aiplatform


@api_router.post(
    "/predict-vertex",
    response_model=PredictionResponse,
    dependencies=[Depends(verify_iap)],
)
def submit_vertex_pipeline(request: PredictionRequest):
    """
    Submits a Vertex AI Pipeline job for the Boltz-2 model using serverless GPUs.
    This replaces the old Batch Prediction paradigm.
    """
    if request.model_name.lower() != "boltz-2":
        raise HTTPException(status_code=400, detail="Only 'boltz-2' is supported.")

    job_id = f"vertex-boltz-{uuid.uuid4().hex[:8]}"
    project_id = get_project_id()
    region = os.environ.get("REGION", "us-central1")
    output_bucket = get_output_bucket()
    input_bucket = get_input_bucket()

    input_uri = f"{input_bucket}/{request.input_file}"
    output_uri = f"{output_bucket}/outputs/{job_id}/"

    # Initialize the Vertex AI SDK
    aiplatform.init(project=project_id, location=region)

    try:
        # The pipeline expects a compiled .yaml file which can be hosted in GCS or locally.
        # Ensure the boltz_pipeline.yaml was built and placed in the FastAPI environment.
        pipeline_job = aiplatform.PipelineJob(
            display_name=job_id,
            template_path="/app/boltz_pipeline.yaml",
            parameter_values={
                "input_uri": input_uri,
                "output_uri": output_uri,
                "config_uri": f"{input_bucket}/{request.config_file}"
                if request.config_file
                else "",
            },
            enable_caching=False,
        )

        pipeline_job.submit(
            service_account=f"ml-job-sa@{project_id}.iam.gserviceaccount.com"
        )

        return {
            "job_id": job_id,
            "message": f"Successfully launched Vertex AI Pipeline run for {request.model_name}",
        }
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Failed to create Vertex AI Pipeline: {str(e)}"
        )


@api_router.get("/jobs", dependencies=[Depends(verify_iap)])
def list_jobs(
    page_size: int = Query(
        10, ge=1, le=50, description="Number of jobs per page (max 50)"
    ),
    page_token: str | None = Query(None, description="Opaque cursor for the next page"),
):
    project_id = get_project_id()
    region = os.environ.get("REGION", "us-central1")

    try:
        aiplatform.init(project=project_id, location=region)

        pipeline_jobs = aiplatform.PipelineJob.list(
            order_by="create_time desc",
        )

        all_jobs = []
        for j in pipeline_jobs:
            if not j.display_name.startswith("vertex-boltz-"):
                continue
            all_jobs.append(j)

        start_idx = 0
        if page_token:
            try:
                start_idx = int(base64.urlsafe_b64decode(page_token.encode()).decode())
            except Exception:
                raise HTTPException(status_code=400, detail="Invalid page_token")
            if start_idx < 0 or start_idx >= len(all_jobs):
                raise HTTPException(status_code=400, detail="Invalid page_token")

        page = all_jobs[start_idx : start_idx + page_size]
        has_more = (start_idx + page_size) < len(all_jobs)
        next_token = (
            base64.urlsafe_b64encode(str(start_idx + page_size).encode()).decode()
            if has_more
            else None
        )

        status_map = {
            "PIPELINE_STATE_PENDING": "Pending",
            "PIPELINE_STATE_RUNNING": "Running",
            "PIPELINE_STATE_SUCCEEDED": "Succeeded",
            "PIPELINE_STATE_FAILED": "Failed",
            "PIPELINE_STATE_CANCELLING": "Failed",
            "PIPELINE_STATE_CANCELLED": "Failed",
        }

        job_list = []
        for j in page:
            state_str = str(j.state.name) if j.state else "UNKNOWN"
            status = status_map.get(state_str, "Pending")

            job_list.append(
                {
                    "job_id": j.display_name,
                    "model_name": "boltz-2",
                    "status": status,
                    "creation_time": j.create_time.isoformat()
                    if j.create_time
                    else None,
                }
            )

        return {
            "jobs": job_list,
            "next_page_token": next_token,
            "has_more": has_more,
            "total_count": len(all_jobs),
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error listing Vertex AI jobs: {e}"
        )


@api_router.get("/status/{job_id}", dependencies=[Depends(verify_iap)])
def get_job_status(job_id: str):
    project_id = get_project_id()
    region = os.environ.get("REGION", "us-central1")

    try:
        aiplatform.init(project=project_id, location=region)

        # We need to find the specific pipeline job by its display_name
        pipeline_jobs = aiplatform.PipelineJob.list(
            filter=f'display_name="{job_id}"',
        )

        if not pipeline_jobs:
            raise HTTPException(status_code=404, detail="Job not found")

        job = pipeline_jobs[0]

        status_map = {
            "PIPELINE_STATE_PENDING": "Pending",
            "PIPELINE_STATE_RUNNING": "Running",
            "PIPELINE_STATE_SUCCEEDED": "Succeeded",
            "PIPELINE_STATE_FAILED": "Failed",
            "PIPELINE_STATE_CANCELLING": "Failed",
            "PIPELINE_STATE_CANCELLED": "Failed",
        }

        state_str = str(job.state.name) if job.state else "UNKNOWN"
        status = status_map.get(state_str, "Pending")

        return {"job_id": job_id, "status": status}
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error checking job status: {e}")


@api_router.get("/jobs/{job_id}/cif", dependencies=[Depends(verify_iap)])
def get_job_cif(job_id: str):
    """
    Retrieves the generated .cif file for a given job directly from the output bucket.
    """
    output_bucket = get_output_bucket()
    bucket_name = output_bucket.replace("gs://", "").split("/")[0]

    try:
        storage_client = storage.Client()
        bucket = storage_client.bucket(bucket_name)

        # Look for any .cif file under the job's output directory
        blobs = list(bucket.list_blobs(prefix=f"outputs/{job_id}/"))
        cif_blob = next((b for b in blobs if b.name.endswith(".cif")), None)

        if not cif_blob:
            raise HTTPException(
                status_code=404, detail="CIF file not found for this job."
            )

        content = cif_blob.download_as_bytes()
        return Response(content=content, media_type="chemical/x-cif")
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=f"Error retrieving CIF: {e}")


app.include_router(api_router)

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
