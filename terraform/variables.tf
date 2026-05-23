variable "project_id" {
  description = "The GCP Project ID"
  type        = string
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

variable "iap_support_email" {
  description = "Support email for the IAP OAuth Brand"
  type        = string
}

variable "iap_allowed_members" {
  description = "List of IAM members allowed to access the application via IAP (e.g., 'user:foo@example.com', 'domain:example.com')"
  type        = list(string)
  default     = []
}

variable "domain_name" {
  description = "The domain name for the ML HPC Platform (e.g., 'ml.example.com'). Used for Managed SSL."
  type        = string
}