output "artifact_registry_repository" {
  value       = google_artifact_registry_repository.containers.name
  description = "Artifact Registry repository for platform images."
}

output "api_url" {
  value       = google_cloud_run_v2_service.api.uri
  description = "Cloud Run API URL."
}

output "web_url" {
  value       = google_cloud_run_v2_service.web.uri
  description = "Cloud Run trader web URL."
}

output "admin_url" {
  value       = google_cloud_run_v2_service.admin.uri
  description = "Cloud Run admin URL."
}

