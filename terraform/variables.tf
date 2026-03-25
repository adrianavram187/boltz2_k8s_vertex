variable "project_id" {
  description = "The GCP Project ID"
  type        = string
  default     = "YOUR_PROJECT_ID_HERE"
}

variable "region" {
  description = "The GCP region"
  type        = string
  default     = "us-central1"
}

variable "cluster_name" {
  description = "The GKE cluster name"
  type        = string
  default     = "ml-hpc-cluster"
}