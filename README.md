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

### Step 1: GCP Setup & Authentication
1. Create a new project in Google Cloud Console.
2. Enable Billing for your new project.
3. Authenticate your CLI:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_NEW_PROJECT_ID
   gcloud auth application-default login
   ```

### Step 2: Global Project ID Replacement
Before applying infrastructure or building images, you **MUST** replace the hardcoded project ID (`YOUR_PROJECT_ID_HERE`) with your actual `YOUR_NEW_PROJECT_ID`.

Run a global find-and-replace, paying special attention to these files:
- `terraform/variables.tf` (Default project_id variable)
- `boltz/submit_pipeline.sh` (PROJECT_ID variable)
- `fastapi-app/build_push.sh` (PROJECT_ID variable)
- `ui/build_push.sh` (PROJECT_ID variable)

---

### Step 3: Choose Your Implementation Path

#### Path A: Vertex AI Pipelines (Serverless GPUs)
This is the default configuration. The UI and Backend are already wired to use this.
1. Leave `terraform/main.tf` as is (the `gpu_pool` should be commented out).
2. Proceed directly to **Step 4**.

#### Path B: Kubernetes Kueue (GKE Spot Node Pools)
If you want to use the native K8s job scheduler instead of Vertex AI:
1. Open `terraform/main.tf` and uncomment the `google_container_node_pool.gpu_pool` block.
2. Open `ui/src/pages/Home.tsx` and change the fetch call inside `handleUploadAndRun` from `/predict-vertex` to `/predict`. 
3. Update the `/jobs` and `/status` endpoints in `fastapi-app/main.py` to use `k8s_batch_v1` instead of `aiplatform`.

---

### Step 4: Infrastructure Provisioning (Terraform)
This will create the GKE Cluster, Workload Identity Service Accounts, and Cloud Storage buckets.

```bash
cd terraform
terraform init
terraform apply -auto-approve
```

### Step 5: Kubernetes Authentication
Link `kubectl` to your newly created cluster so you can deploy the APIs:
```bash
gcloud container clusters get-credentials ml-hpc-cluster --region us-central1 --project YOUR_NEW_PROJECT_ID
```

*(If using Path B: Kueue)* Install Kueue and apply the queues:
```bash
kubectl apply --server-side -f https://github.com/kubernetes-sigs/kueue/releases/download/v0.10.0/manifests.yaml
kubectl wait deploy/kueue-controller-manager -n kueue-system --for=condition=available --timeout=5m
cd ../k8s/kueue
kubectl apply -f resource-flavor.yaml
kubectl apply -f cluster-queue.yaml
kubectl apply -f local-queue.yaml
```

### Step 6: Build and Compile the Vertex AI Pipeline
You must build the Boltz-2 container. If using Vertex AI, this also compiles the Python pipeline definition into a YAML file.

```bash
cd ../boltz
# Install the Kubeflow Pipelines compiler (Required for Path A)
pip install kfp google-cloud-aiplatform
# Build the Docker image, push it to GCR, and compile the pipeline
./submit_pipeline.sh
```

### Step 7: Build and Deploy the Application
**1. FastAPI Backend**
```bash
cd ../fastapi-app
./build_push.sh
```

**2. React UI**
```bash
cd ../ui
./build_push.sh
```

### Step 8: Deploy to Kubernetes
Deploy the workloads and link the IAM Workload Identity to your Kubernetes Service Accounts:

```bash
# 1. Setup the Kubernetes Service Accounts linked to IAM
kubectl apply -f k8s/app/rbac.yaml

# 2. Deploy the FastAPI Backend
kubectl apply -f k8s/app/deployment.yaml
kubectl apply -f k8s/app/service.yaml

# 3. Deploy the React UI Reverse Proxy
kubectl apply -f k8s/ui/deployment.yaml
```

### Step 9: Access the Platform!
The React UI is deployed behind an external K8s LoadBalancer. Find its public IP:

```bash
kubectl get svc ml-ui-service -n default
```
Wait a minute or two for GCP to assign an `EXTERNAL-IP`. Copy that IP into your browser (e.g. `http://34.x.y.z`). 

You can now drag and drop a `dummy.fasta` file, submit the job, and watch the platform dynamically scale up a Spot GPU in real-time to fold the protein!