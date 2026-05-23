# Enable IAP API
resource "google_project_service" "iap" {
  project            = var.project_id
  service            = "iap.googleapis.com"
  disable_on_destroy = false
}

# Assign IAP Web-App access to users/groups for the backend services
resource "google_iap_web_iam_binding" "iap_accessor" {
  project = var.project_id
  role    = "roles/iap.httpsResourceAccessor"
  members = var.iap_allowed_members
}