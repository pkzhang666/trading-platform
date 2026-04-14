output "name" {
  description = "GKE cluster name."
  value       = google_container_cluster.this.name
}

output "location" {
  description = "GKE cluster location."
  value       = google_container_cluster.this.location
}

output "endpoint" {
  description = "GKE control plane endpoint."
  value       = google_container_cluster.this.endpoint
}
