output "kubernetes_cluster_name" {
  value       = google_container_cluster.primary.name
  description = "GKE Cluster Name"
}

output "get_credentials_command" {
  value       = "gcloud container clusters get-credentials ${google_container_cluster.primary.name} --region ${var.region} --project ${var.project_id}"
  description = "Command to configure kubectl"
}

output "output_bucket_url" {
  value       = "gs://${google_storage_bucket.boltz_outputs.name}"
  description = "GCS Bucket for Boltz-2 outputs"
}

output "input_bucket_url" {
  value       = "gs://${google_storage_bucket.boltz_inputs.name}"
  description = "GCS Bucket for Boltz-2 inputs"
}
