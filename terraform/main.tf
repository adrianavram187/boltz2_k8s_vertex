resource "google_project_service" "compute" {
  project            = var.project_id
  service            = "compute.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "container" {
  project            = var.project_id
  service            = "container.googleapis.com"
  disable_on_destroy = false
}

# GKE Cluster
resource "google_container_cluster" "primary" {
  name     = var.cluster_name
  location = var.region

  # We can't create a cluster with no node pool defined, but we want to only use
  # separately managed node pools. So we create the smallest possible default
  # node pool and immediately delete it.
  remove_default_node_pool = true
  initial_node_count       = 1
  deletion_protection      = false

  # Required for Kueue/Workload Identity
  workload_identity_config {
    workload_pool = "${var.project_id}.svc.id.goog"
  }

  depends_on = [
    google_project_service.compute,
    google_project_service.container,
  ]
}

# Standard Node Pool (for control plane add-ons, FastAPI, Kueue)
resource "google_container_node_pool" "standard_pool" {
  name     = "standard-pool"
  cluster  = google_container_cluster.primary.name
  location = var.region

  initial_node_count = 1

  autoscaling {
    total_min_node_count = 1
    total_max_node_count = 3
  }

  node_config {
    machine_type = "e2-standard-4"
    oauth_scopes = [
      "https://www.googleapis.com/auth/cloud-platform"
    ]
  }
}

# GPU Node Pool (Autoscales to 0)
# resource "google_container_node_pool" "gpu_pool" {
#   name     = "gpu-pool"
#   cluster  = google_container_cluster.primary.name
#   location = var.region
# 
#   # L4 is only available in specific zones in us-central1 (e.g. us-central1-a, us-central1-c)
#   node_locations = ["us-central1-a", "us-central1-b", "us-central1-c"]
# 
#   initial_node_count = 0
# 
#   autoscaling {
#     min_node_count = 0
#     max_node_count = 5
#   }
# 
#   node_config {
#     spot = true # Enable Spot Instances to dramatically reduce costs
# 
#     # L4 GPUs require G2 machine types
#     machine_type = "g2-standard-8"
# 
#     guest_accelerator {
#       type  = "nvidia-l4"
#       count = 1
#       gpu_driver_installation_config {
#         gpu_driver_version = "LATEST"
#       }
#     }
# 
#     oauth_scopes = [
#       "https://www.googleapis.com/auth/cloud-platform"
#     ]
# 
#     # Taint prevents standard pods from being scheduled on expensive GPU nodes
#     taint {
#       key    = "nvidia.com/gpu"
#       value  = "present"
#       effect = "NO_SCHEDULE"
#     }
#   }
# }

# GCS Output Bucket for Boltz-2 Predictions
resource "google_storage_bucket" "boltz_outputs" {
  name                        = "${var.project_id}-boltz-outputs"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
}

# GCS Input Bucket for Boltz-2 Predictions
resource "google_storage_bucket" "boltz_inputs" {
  name                        = "${var.project_id}-boltz-inputs"
  location                    = var.region
  force_destroy               = true
  uniform_bucket_level_access = true
}

# Create a GCP Service Account for the Kubernetes Jobs
resource "google_service_account" "ml_job_sa" {
  account_id   = "ml-job-sa"
  display_name = "Service Account for ML Jobs"
  project      = var.project_id
}

# Create a GCP Service Account for the FastAPI Backend App
resource "google_service_account" "fastapi_sa" {
  account_id   = "fastapi-sa"
  display_name = "Service Account for FastAPI Backend"
  project      = var.project_id
}

# Grant the Service Accounts storage access (so FastAPI can write JSONL inputs, and ML Job can read/write FASTA)
resource "google_project_iam_binding" "ml_job_storage_admin" {
  project = var.project_id
  role    = "roles/storage.admin"
  members = [
    "serviceAccount:${google_service_account.ml_job_sa.email}",
    "serviceAccount:${google_service_account.fastapi_sa.email}"
  ]
}

# Grant FastAPI and ML Job Service Account access to submit and run Vertex AI Pipelines
resource "google_project_iam_binding" "fastapi_aiplatform_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  members = [
    "serviceAccount:${google_service_account.fastapi_sa.email}",
    "serviceAccount:${google_service_account.ml_job_sa.email}"
  ]
}

# Grant FastAPI access to act as the ML Job Service Account (required to pass service_account to Vertex AI)
resource "google_service_account_iam_member" "fastapi_can_act_as_ml_job" {
  service_account_id = google_service_account.ml_job_sa.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.fastapi_sa.email}"
}

# Bind the GCP Service Account to the Kubernetes Service Account via Workload Identity (for ML Jobs)
resource "google_service_account_iam_binding" "ml_job_wi_binding" {
  service_account_id = google_service_account.ml_job_sa.name
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[default/ml-job-sa]"
  ]
}

# Bind the GCP Service Account to the Kubernetes Service Account via Workload Identity (for FastAPI)
resource "google_service_account_iam_binding" "fastapi_wi_binding" {
  service_account_id = google_service_account.fastapi_sa.name
  role               = "roles/iam.workloadIdentityUser"
  members = [
    "serviceAccount:${var.project_id}.svc.id.goog[default/fastapi-sa]"
  ]
}
