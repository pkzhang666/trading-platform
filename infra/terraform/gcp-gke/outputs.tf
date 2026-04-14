output "artifact_registry_repository" {
  value       = module.artifact_registry.name
  description = "Artifact Registry repository for platform images."
}

output "cluster_name" {
  value       = module.gke_cluster.name
  description = "GKE cluster name."
}

output "cluster_location" {
  value       = module.gke_cluster.location
  description = "GKE cluster location."
}

output "network_name" {
  value       = module.networking.network_name
  description = "VPC name for the GKE environment."
}

output "api_workload_service_account_email" {
  value       = module.api_workload_service_account.email
  description = "GCP service account used by the API workload through Workload Identity."
}

output "cloud_sql_instance_connection_name" {
  value       = module.cloud_sql.connection_name
  description = "Cloud SQL instance connection name for the sidecar proxy."
}

output "database_url_secret_name" {
  value       = module.database_url_secret.secret_name
  description = "Secret Manager secret containing the database connection URL."
}

output "password_pepper_secret_name" {
  value       = module.password_pepper_secret.secret_name
  description = "Secret Manager secret containing the password pepper."
}

output "bootstrap_admin_password_secret_name" {
  value       = module.bootstrap_admin_password_secret.secret_name
  description = "Secret Manager secret containing the bootstrap admin password."
}

output "bootstrap_trader_password_secret_name" {
  value       = module.bootstrap_trader_password_secret.secret_name
  description = "Secret Manager secret containing the bootstrap trader password."
}
