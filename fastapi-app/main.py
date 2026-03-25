from fastapi import FastAPI, HTTPException, UploadFile, File
from fastapi.responses import Response
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uuid
import os
import tempfile
from kubernetes import client, config

from google.cloud import aiplatform
from google.cloud import storage

app = FastAPI(title="ML HPC Job Submission API")

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


class PredictionResponse(BaseModel):
    job_id: str
    message: str


@app.post("/upload")
async def upload_file(file: UploadFile = File(...)):
    """
    Uploads a FASTA file to the input bucket
    """
    input_bucket = os.environ.get(
        "INPUT_BUCKET", "gs://YOUR_PROJECT_ID_HERE-boltz-inputs"
    )
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
        blob.upload_from_string(contents)

        # We return the FULL blob name here (e.g. 'uploads/a1b2c3d4/C7F6X3.fasta')
        # So that the predict endpoint constructs the GS URI correctly
        return {"filename": blob_name, "message": "File uploaded successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to upload file: {str(e)}")


@app.post("/predict", response_model=PredictionResponse)
def submit_prediction(request: PredictionRequest):
    if not k8s_batch_v1:
        raise HTTPException(status_code=500, detail="Kubernetes client not configured.")

    if request.model_name.lower() != "boltz-2":
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported model: {request.model_name}. Only 'boltz-2' is supported.",
        )

    job_id = f"ml-job-boltz-2-{uuid.uuid4().hex[:8]}"
    image = "gcr.io/YOUR_PROJECT_ID_HERE/boltz-runner:latest"
    output_bucket = os.environ.get(
        "OUTPUT_BUCKET", "gs://YOUR_PROJECT_ID_HERE-boltz-outputs"
    )
    input_bucket = os.environ.get(
        "INPUT_BUCKET", "gs://YOUR_PROJECT_ID_HERE-boltz-inputs"
    )

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


@app.post("/predict-vertex", response_model=PredictionResponse)
def submit_vertex_pipeline(request: PredictionRequest):
    """
    Submits a Vertex AI Pipeline job for the Boltz-2 model using serverless GPUs.
    This replaces the old Batch Prediction paradigm.
    """
    if request.model_name.lower() != "boltz-2":
        raise HTTPException(status_code=400, detail="Only 'boltz-2' is supported.")

    job_id = f"vertex-boltz-{uuid.uuid4().hex[:8]}"
    project_id = os.environ.get("PROJECT_ID", "YOUR_PROJECT_ID_HERE")
    region = os.environ.get("REGION", "us-central1")
    output_bucket = os.environ.get("OUTPUT_BUCKET", f"gs://{project_id}-boltz-outputs")
    input_bucket = os.environ.get("INPUT_BUCKET", f"gs://{project_id}-boltz-inputs")

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
            },
            enable_caching=False,
        )

        # Submit the pipeline to run asynchronously on Google Cloud serverless infrastructure
        # We explicitly request a SPOT (Preemptible) L4 GPU because standard L4 quota is 0.
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


@app.get("/jobs")
def list_jobs():
    project_id = os.environ.get("PROJECT_ID", "YOUR_PROJECT_ID_HERE")
    region = os.environ.get("REGION", "us-central1")

    try:
        aiplatform.init(project=project_id, location=region)

        # List recent pipeline jobs
        pipeline_jobs = aiplatform.PipelineJob.list(
            order_by="create_time desc",
        )

        job_list = []
        for j in pipeline_jobs:
            # Manually filter by prefix since Vertex API string filtering can be finicky
            if not j.display_name.startswith("vertex-boltz-"):
                continue

            # Vertex AI pipeline states: PIPELINE_STATE_PENDING, PIPELINE_STATE_RUNNING, PIPELINE_STATE_SUCCEEDED, PIPELINE_STATE_FAILED
            status_map = {
                "PIPELINE_STATE_PENDING": "Pending",
                "PIPELINE_STATE_RUNNING": "Running",
                "PIPELINE_STATE_SUCCEEDED": "Succeeded",
                "PIPELINE_STATE_FAILED": "Failed",
                "PIPELINE_STATE_CANCELLING": "Failed",
                "PIPELINE_STATE_CANCELLED": "Failed",
            }

            # Map state or default to the raw state
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

            # Add a manual limit of 20 since we removed it from the API call
            if len(job_list) >= 20:
                break

        return {"jobs": job_list}
    except Exception as e:
        raise HTTPException(
            status_code=500, detail=f"Error listing Vertex AI jobs: {e}"
        )


@app.get("/status/{job_id}")
def get_job_status(job_id: str):
    project_id = os.environ.get("PROJECT_ID", "YOUR_PROJECT_ID_HERE")
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


@app.get("/jobs/{job_id}/cif")
def get_job_cif(job_id: str):
    """
    Retrieves the generated .cif file for a given job directly from the output bucket.
    """
    output_bucket = os.environ.get(
        "OUTPUT_BUCKET", "gs://YOUR_PROJECT_ID_HERE-boltz-outputs"
    )
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


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
