output "email" {
  description = "Service account email."
  value       = google_service_account.this.email
}

output "name" {
  description = "Service account resource name."
  value       = google_service_account.this.name
}
