output "artifact_registry_repository" {
  value       = module.artifact_registry.name
  description = "Artifact Registry repository for platform images."
}

output "runtime_service_account_email" {
  value       = module.runtime_service_account.email
  description = "Runtime service account email."
}

output "api_url" {
  value       = module.api_service.uri
  description = "Cloud Run API URL."
}

output "web_url" {
  value       = module.web_service.uri
  description = "Cloud Run trader web URL."
}

output "admin_url" {
  value       = module.admin_service.uri
  description = "Cloud Run admin URL."
}
