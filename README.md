# High-Performance ML Inference Platform (Boltz-2)

A production-ready, cloud-native High-Performance Computing (HPC) platform built on Google Cloud Platform (GCP) and Kubernetes (GKE). 

This repository supports **two distinct architectures** for running heavy machine learning workloads (like Boltz-2 folding models) while keeping idle costs at strictly zero:

1. **Vertex AI Pipelines (Serverless GPUs) [Currently Active in UI]:** Submits jobs to Google's managed serverless AI infrastructure. Scales instantly, provides out-of-the-box artifact tracking, and avoids managing Kubernetes GPU nodes.
2. **Kubernetes Kueue (GKE Spot Node Pools):** Submits jobs to a native K8s Queue. A custom Spot GPU node pool autoscales from zero to handle the queue. Better for strict concurrent quotas and bypassing managed service markup fees.

### Architecture Components
1. **Terraform**: Fully automated infrastructure setup (GKE, GCS, IAM Workload Identity).
2. **FastAPI Backend**: A highly concurrent REST API that wraps sequence inputs. It exposes both `/predict-vertex` (Vertex AI) and `/predict` (Kueue) endpoints. 
3. **React UI**: A sleek frontend that lets researchers upload `.fasta` files, track jobs, and view 3D molecular structures (`.cif` files) interactively.
4. **Boltz-2 Runner**: A Docker image built on the official Vertex AI PyTorch GPU container, running Boltz-2 with `--use_msa_server` (public MSA server) and memory optimizations (`--num_workers 0`).

---

## How to Deploy on a NEW GCP Project

Follow these steps to deploy the entire stack to a brand-new Google Cloud project.

### Common Prerequisites

> **⚠️ Important note regarding IAP and OAuth Consent Screen:**
> Since your project does not belong to a Google Cloud Organization (e.g., using a personal `@gmail.com` account), Terraform **cannot** create the OAuth brand programmatically. You must create the OAuth Consent Screen and credentials manually:
> 
> 1. Go to the [Google Cloud Console -> APIs & Services -> OAuth consent screen](https://console.cloud.google.com/apis/credentials/consent).
> 2. Choose **External** and create the consent screen (Fill in app name, support email, and developer contact info).
> 3. Go to **Credentials** -> Create Credentials -> **OAuth client ID**.
> 4. Application type: **Web application**. Name: `ML HPC IAP Client`.
> 5. Authorized redirect URIs: Add `https://iap.googleapis.com/v1/oauth/clientIds/YOUR_CLIENT_ID:handleRedirect` (You will need to create the client to get the ID, then edit the client to add this URI).
> 6. Copy the **Client ID** and **Client Secret**.
> 7. We will inject these into Kubernetes manually instead of using Terraform.

**Step 1: GCP Setup & Authentication**
1. Create a new project in Google Cloud Console.
2. Enable Billing for your new project.
3. Authenticate your CLI:
   ```bash
   gcloud auth login
   gcloud config set project YOUR_NEW_PROJECT_ID
   gcloud auth application-default login
   ```

**Step 2: Global Project ID and IAP Configuration**
Before applying infrastructure or building images, you **MUST** create a `.env` file in the root directory and set your `PROJECT_ID`, your allowed users, and your custom domain name for the IAP LoadBalancer:

```bash
cat <<EOF > .env
PROJECT_ID=YOUR_NEW_PROJECT_ID
TF_VAR_iap_support_email=admin@example.com
TF_VAR_iap_allowed_members='["user:foo@example.com", "domain:example.com"]'
DISABLE_IAP_VALIDATION=false

# If you own a domain, enter it here (e.g. ml.example.com)
# If you DO NOT own a domain, leave this blank for now. We will use a nip.io domain later.
DOMAIN_NAME=
EOF
```
This `.env` file is loaded by the bash scripts, Terraform, and the FastAPI backend.

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

> **Prerequisite:** Request quota for `Custom model training Nvidia T4 GPUs` in `us-central1` via IAM & Admin → Quotas. Default is 0.

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

First, create the Kubernetes Secret containing your manually generated OAuth Client ID and Secret:
```bash
kubectl create secret generic iap-oauth-secret \
  --from-literal=client_id=YOUR_OAUTH_CLIENT_ID_HERE \
  --from-literal=client_secret=YOUR_OAUTH_CLIENT_SECRET_HERE
```

Now, load the environment variables and deploy the services:
Now, we need to know the static IP address that Terraform provisioned for your Load Balancer:
```bash
cd terraform
export PLATFORM_IP=$(terraform output -raw platform_ip_address)
cd ..
echo "Your platform IP is: $PLATFORM_IP"

# If you left DOMAIN_NAME blank in Step 2, run this to auto-generate a nip.io domain:
sed -i.bak "s/^DOMAIN_NAME=$/DOMAIN_NAME=$PLATFORM_IP.nip.io/" .env
```

Now, load the environment variables and deploy the services:
```bash
export $(grep -v '^#' .env | xargs)
envsubst < k8s/managed-cert.yaml | kubectl apply -f -
envsubst < k8s/ingress.yaml | kubectl apply -f -
kubectl apply -f k8s/backendconfig.yaml
envsubst < k8s/app/rbac.yaml | kubectl apply -f -
envsubst < k8s/app/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/app/service.yaml
envsubst < k8s/ui/deployment.yaml | kubectl apply -f -
```

**Step A.6: Access the Platform!**

Check the status of your Managed SSL Certificate:
```bash
kubectl get managedcertificate ml-hpc-cert
```
*Note: Google Managed Certificates can take 10-20 minutes to transition from `PROVISIONING` to `ACTIVE`. The load balancer will return a 404 or SSL error until this is complete.*

Once active, access the platform at your secure domain:
```bash
export $(grep -v '^#' .env | xargs)
echo "Go to: https://$DOMAIN_NAME"
```

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

> **Prerequisite:** For Vertex AI Pipelines (default), request quota for `Custom model training Nvidia T4 GPUs` in `us-central1`.

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

**Step B.6: Configure Domain and Deploy Core Services to Kubernetes**

First, create the Kubernetes Secret containing your manually generated OAuth Client ID and Secret:
```bash
kubectl create secret generic iap-oauth-secret \
  --from-literal=client_id=YOUR_OAUTH_CLIENT_ID_HERE \
  --from-literal=client_secret=YOUR_OAUTH_CLIENT_SECRET_HERE
```

Next, we need to know the static IP address that Terraform provisioned for your Load Balancer:
Now, we need to know the static IP address that Terraform provisioned for your Load Balancer:
```bash
cd terraform
export PLATFORM_IP=$(terraform output -raw platform_ip_address)
cd ..
echo "Your platform IP is: $PLATFORM_IP"

# If you left DOMAIN_NAME blank in Step 2, run this to auto-generate a nip.io domain:
sed -i.bak "s/^DOMAIN_NAME=$/DOMAIN_NAME=$PLATFORM_IP.nip.io/" .env
```

Now, load the environment variables and deploy the services:
```bash
export $(grep -v '^#' .env | xargs)
envsubst < k8s/managed-cert.yaml | kubectl apply -f -
envsubst < k8s/ingress.yaml | kubectl apply -f -
kubectl apply -f k8s/backendconfig.yaml
envsubst < k8s/app/rbac.yaml | kubectl apply -f -
envsubst < k8s/app/deployment.yaml | kubectl apply -f -
kubectl apply -f k8s/app/service.yaml
envsubst < k8s/ui/deployment.yaml | kubectl apply -f -
```

**Step B.7: Access the Platform!**

Check the status of your Managed SSL Certificate:
```bash
kubectl get managedcertificate ml-hpc-cert
```
*Note: Google Managed Certificates can take 10-20 minutes to transition from `PROVISIONING` to `ACTIVE`. The load balancer will return a 404 or SSL error until this is complete.*

Once active, access the platform at your secure domain:
```bash
export $(grep -v '^#' .env | xargs)
echo "Go to: https://$DOMAIN_NAME"
```

You can now drag and drop a `dummy.fasta` file, submit the job, and watch the platform dynamically scale up a Spot GPU in real-time to fold the protein!