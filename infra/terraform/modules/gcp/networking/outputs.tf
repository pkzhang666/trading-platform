output "network_name" {
  description = "VPC network name."
  value       = google_compute_network.this.name
}

output "network_self_link" {
  description = "VPC network self link."
  value       = google_compute_network.this.self_link
}

output "subnetwork_name" {
  description = "Primary subnetwork name."
  value       = google_compute_subnetwork.this.name
}

output "subnetwork_self_link" {
  description = "Primary subnetwork self link."
  value       = google_compute_subnetwork.this.self_link
}

output "pods_secondary_range_name" {
  description = "Secondary range name used for GKE pods."
  value       = var.pods_secondary_range_name
}

output "services_secondary_range_name" {
  description = "Secondary range name used for GKE services."
  value       = var.services_secondary_range_name
}
