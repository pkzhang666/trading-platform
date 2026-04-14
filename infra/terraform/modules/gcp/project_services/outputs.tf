output "enabled_services" {
  description = "Project services managed by the module."
  value       = keys(google_project_service.this)
}
