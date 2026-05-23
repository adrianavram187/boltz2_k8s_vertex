# High-Performance ML Inference Platform (Boltz-2)

A production-ready, cloud-native High-Performance Computing (HPC) platform built on Google Cloud Platform (GCP) and Kubernetes (GKE). 

This repository supports **two distinct architectures** for running heavy machine learning workloads (like Boltz-2 folding models) while keeping idle costs at strictly zero:

1. **Vertex AI Pipelines (Serverless GPUs) [Currently Active in UI]:** Submits jobs to Google's managed serverless AI infrastructure. Scales instantly, provides out-of-the-box artifact tracking, and avoids managing Kubernetes GPU nodes.
2. **Kubernetes Kueue (GKE Spot Node Pools):** Submits jobs to a native K8s Queue. A custom Spot GPU node pool autoscales from zero to handle the queue. Better for strict concurrent quotas and bypassing managed service markup fees.

### Architecture Components
1. **Terraform**: Fully automated infrastructure setup (GKE, GCS, IAM Workload Identity).
2. **FastAPI Backend**: A highly concurrent REST API that wraps sequence inputs. It exposes both `/predict-vertex` (Vertex AI) and `/predict` (Kueue) endpoints. 
3. **React UI**: A sleek frontend that lets researchers upload `.fasta` files, track jobs, and view 3D molecular structures (`.cif` files) interactively.
4. **Boltz-2 Runner**: A highly optimized `linux/amd64` Docker image configured with memory optimizations (`--num_workers 0`).

---

## How to Deploy on a NEW GCP Project

Follow these steps to deploy the entire stack to a brand-new Google Cloud project.

### Common Prerequisites

**Step 1: GCP Setup & Authentication**
1. Create a new project in Google Cloud Console.
2. Enable Billing for your new project.
3. Authenticate your CLI:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_NEW_PROJECT_ID
   gcloud auth application-default login
   ```

**Step 2: Global Project ID Configuration**
Before applying infrastructure or building images, you **MUST** create a `.env` file in the root directory and set your `PROJECT_ID`:

```bash
echo "PROJECT_ID=YOUR_NEW_PROJECT_ID" > .env
```
This `.env` file is loaded by the bash scripts and the FastAPI backend.

---

### Choose Your Implementation Path

Choose either **Path A** (Serverless Vertex AI - recommended) or **Path B** (K8s Kueue with Spot Nodes). Follow the steps exclusively for your chosen path.

---

### Path A: Vertex AI Pipelines (Serverless GPUs)

*This is the default configuration requiring no code changes.*

**Step A.1: Infrastructure Provisioning (Terraform)**
```bash
cd terraform
terraform init
export TF_VAR_project_id=$(grep PROJECT_ID ../.env | cut -d '=' -f2)
terraform apply -auto-approve
cd ..
```

**Step A.2: Kubernetes Authentication**
```bash
export $(grep -v '^#' .env | xargs)
gcloud container clusters get-credentials ml-hpc-cluster --region us-central1 --project $PROJECT_ID
```

**Step A.3: Build the ML Runner (Boltz-2)**
```bash
cd boltz
pip install kfp google-cloud-aiplatform python-dotenv
./submit_pipeline.sh
cd ..
```

**Step A.4: Build Application Images (FastAPI & UI)**
```bash
cd fastapi-app
./build_push.sh
cd ../ui
./build_push.sh
cd ..
```

**Step A.5: Deploy Core Services to Kubernetes**
```bash
export $(grep -v '^#' .env | xargs)
envsubst < k8s/app/rbac.yaml | kubectl apply -f -
envsubst < k8s/app/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/app/service.yaml
envsubst < k8s/ui/deployment.yaml | kubectl apply -f -
```

**Step A.6: Access the Platform!**
```bash
kubectl get svc ml-ui-service -n default
```
Wait a minute or two for GCP to assign an `EXTERNAL-IP`. Copy that IP into your browser (e.g. `http://34.x.y.z`).

---

### Path B: Kubernetes Kueue (GKE Spot Node Pools)

**Step B.1: Code Modifications**
1. Open `terraform/main.tf` and uncomment the `google_container_node_pool.gpu_pool` block.
2. Open `ui/src/pages/Home.tsx` and change the fetch call inside `handleUploadAndRun` from `/predict-vertex` to `/predict`. 
3. Update the `/jobs` and `/status` endpoints in `fastapi-app/main.py` to use `k8s_batch_v1` instead of `aiplatform`.

**Step B.2: Infrastructure Provisioning (Terraform)**
```bash
cd terraform
terraform init
export TF_VAR_project_id=$(grep PROJECT_ID ../.env | cut -d '=' -f2)
terraform apply -auto-approve
cd ..
```

**Step B.3: Kubernetes Auth & Kueue Setup**
```bash
export $(grep -v '^#' .env | xargs)
gcloud container clusters get-credentials ml-hpc-cluster --region us-central1 --project $PROJECT_ID

kubectl apply --server-side -f https://github.com/kubernetes-sigs/kueue/releases/download/v0.10.0/manifests.yaml
kubectl wait deploy/kueue-controller-manager -n kueue-system --for=condition=available --timeout=5m
kubectl apply -f k8s/kueue/resource-flavor.yaml
kubectl apply -f k8s/kueue/cluster-queue.yaml
kubectl apply -f k8s/kueue/local-queue.yaml
```

**Step B.4: Build the ML Runner (Boltz-2)**
```bash
cd boltz
pip install kfp google-cloud-aiplatform python-dotenv
./submit_pipeline.sh
cd ..
```

**Step B.5: Build Application Images (FastAPI & UI)**
```bash
cd fastapi-app
./build_push.sh
cd ../ui
./build_push.sh
cd ..
```

**Step B.6: Deploy Core Services to Kubernetes**
```bash
export $(grep -v '^#' .env | xargs)
envsubst < k8s/app/rbac.yaml | kubectl apply -f -
envsubst < k8s/app/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/app/service.yaml
envsubst < k8s/ui/deployment.yaml | kubectl apply -f -
```

**Step B.7: Access the Platform!**
```bash
kubectl get svc ml-ui-service -n default
```
Wait a minute or two for GCP to assign an `EXTERNAL-IP`. Copy that IP into your browser (e.g. `http://34.x.y.z`).

You can now drag and drop a `dummy.fasta` file, submit the job, and watch the platform dynamically scale up a Spot GPU in real-time to fold the protein!