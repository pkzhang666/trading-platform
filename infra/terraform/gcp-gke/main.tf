provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix = "${var.project_name}-${var.environment}"
  api_ksa_namespace = "trading-platform"
  api_ksa_name      = "trading-platform-api"
  db_username       = "trading_platform"
  db_name           = "trading_platform"
  labels = {
    project     = var.project_name
    environment = var.environment
    managed-by  = "terraform"
  }
}

module "project_services" {
  source     = "../modules/gcp/project_services"
  project_id = var.project_id
  services = [
    "artifactregistry.googleapis.com",
    "compute.googleapis.com",
    "container.googleapis.com",
    "networkmanagement.googleapis.com",
    "networkservices.googleapis.com",
    "secretmanager.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
  ]
}

module "artifact_registry" {
  source        = "../modules/gcp/artifact_registry"
  project_id    = var.project_id
  location      = var.region
  repository_id = "${var.project_name}-${var.environment}"
  description   = "Container images for the trading platform GKE runtime"

  depends_on = [module.project_services]
}

module "api_workload_service_account" {
  source       = "../modules/gcp/service_account"
  project_id   = var.project_id
  account_id   = substr(replace("${local.prefix}-api", "-", ""), 0, 24)
  display_name = "${local.prefix} API workload"

  depends_on = [module.project_services]
}

module "networking" {
  source                        = "../modules/gcp/networking"
  project_id                    = var.project_id
  region                        = var.region
  name                          = "${local.prefix}-vpc"
  subnetwork_name               = "${local.prefix}-subnet"
  subnet_cidr                   = var.subnet_cidr
  pods_secondary_range_name     = "${local.prefix}-pods"
  pods_secondary_cidr           = var.pods_secondary_cidr
  services_secondary_range_name = "${local.prefix}-services"
  services_secondary_cidr       = var.services_secondary_cidr

  depends_on = [module.project_services]
}

resource "random_password" "database_password" {
  length  = 32
  special = false
}

resource "random_password" "password_pepper" {
  length  = 48
  special = false
}

resource "random_password" "bootstrap_admin_password" {
  length  = 24
  special = true
}

resource "random_password" "bootstrap_trader_password" {
  length  = 24
  special = true
}

module "cloud_sql" {
  source            = "../modules/gcp/cloud_sql_postgres"
  project_id        = var.project_id
  region            = var.region
  name              = "${local.prefix}-pg"
  network_self_link = module.networking.network_self_link
  database_name     = local.db_name
  username          = local.db_username
  password          = random_password.database_password.result
  tier              = var.cloud_sql_tier
  disk_size_gb      = var.cloud_sql_disk_size_gb

  depends_on = [module.project_services, module.networking]
}

resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${module.api_workload_service_account.email}"
}

resource "google_service_account_iam_member" "api_workload_identity" {
  service_account_id = module.api_workload_service_account.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[${local.api_ksa_namespace}/${local.api_ksa_name}]"
}

module "database_url_secret" {
  source      = "../modules/gcp/secret_manager_secret"
  project_id  = var.project_id
  secret_id   = "${local.prefix}-database-url"
  secret_value = "postgresql://${local.db_username}:${random_password.database_password.result}@127.0.0.1:5432/${local.db_name}"
  accessor_members = [
    "serviceAccount:${module.api_workload_service_account.email}"
  ]

  depends_on = [module.project_services]
}

module "password_pepper_secret" {
  source       = "../modules/gcp/secret_manager_secret"
  project_id   = var.project_id
  secret_id    = "${local.prefix}-password-pepper"
  secret_value = random_password.password_pepper.result
  accessor_members = [
    "serviceAccount:${module.api_workload_service_account.email}"
  ]

  depends_on = [module.project_services]
}

module "bootstrap_admin_password_secret" {
  source       = "../modules/gcp/secret_manager_secret"
  project_id   = var.project_id
  secret_id    = "${local.prefix}-bootstrap-admin-password"
  secret_value = random_password.bootstrap_admin_password.result
  accessor_members = [
    "serviceAccount:${module.api_workload_service_account.email}"
  ]

  depends_on = [module.project_services]
}

module "bootstrap_trader_password_secret" {
  source       = "../modules/gcp/secret_manager_secret"
  project_id   = var.project_id
  secret_id    = "${local.prefix}-bootstrap-trader-password"
  secret_value = random_password.bootstrap_trader_password.result
  accessor_members = [
    "serviceAccount:${module.api_workload_service_account.email}"
  ]

  depends_on = [module.project_services]
}

module "gke_cluster" {
  source                        = "../modules/gcp/gke_cluster"
  project_id                    = var.project_id
  region                        = var.region
  name                          = local.prefix
  network                       = module.networking.network_self_link
  subnetwork                    = module.networking.subnetwork_self_link
  cluster_secondary_range_name  = module.networking.pods_secondary_range_name
  services_secondary_range_name = module.networking.services_secondary_range_name
  enable_private_nodes          = var.enable_private_nodes
  master_ipv4_cidr_block        = var.master_ipv4_cidr_block
  node_machine_type             = var.node_machine_type
  min_node_count                = var.min_node_count
  max_node_count                = var.max_node_count
  labels                        = local.labels
  network_tags                  = ["${local.prefix}-gke"]

  depends_on = [module.project_services, module.networking]
}
