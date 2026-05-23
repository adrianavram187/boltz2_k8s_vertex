# We manage the SSL certificate natively via Kubernetes ManagedCertificate Custom Resource
# so it integrates automatically with the GKE Ingress controller.
# We also provision a static IP address to point the domain to.

resource "google_compute_global_address" "ml_hpc_ip" {
  name    = "ml-hpc-global-ip"
  project = var.project_id
}

output "platform_ip_address" {
  description = "The static global IP address for the platform. Map your domain_name to this IP."
  value       = google_compute_global_address.ml_hpc_ip.address
}
