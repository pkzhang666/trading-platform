provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix = "${var.project_name}-${var.environment}"
  labels = {
    project     = var.project_name
    environment = var.environment
    managed-by  = "terraform"
  }
}

module "runtime_service_account" {
  source       = "../modules/gcp/service_account"
  project_id   = var.project_id
  account_id   = substr(replace(local.prefix, "-", ""), 0, 24)
  display_name = "${local.prefix} runtime"
}

module "artifact_registry" {
  source        = "../modules/gcp/artifact_registry"
  project_id    = var.project_id
  location      = var.region
  repository_id = "${var.project_name}-${var.environment}"
  description   = "Container images for the trading platform"
}

module "api_service" {
  source             = "../modules/gcp/cloud_run_service"
  project_id         = var.project_id
  region             = var.region
  name               = "${local.prefix}-api"
  service_account    = module.runtime_service_account.email
  image              = var.api_container_image
  container_port     = 8080
  min_instance_count = 1
  max_instance_count = 4
  labels             = local.labels
  environment = {
    API_PORT  = "8080"
    API_HOST  = "0.0.0.0"
    DATA_FILE = "/tmp/demo-exchange.json"
  }
}

module "web_service" {
  source             = "../modules/gcp/cloud_run_service"
  project_id         = var.project_id
  region             = var.region
  name               = "${local.prefix}-web"
  service_account    = module.runtime_service_account.email
  image              = var.web_container_image
  container_port     = 80
  min_instance_count = 1
  max_instance_count = 3
  labels             = local.labels
}

module "admin_service" {
  source             = "../modules/gcp/cloud_run_service"
  project_id         = var.project_id
  region             = var.region
  name               = "${local.prefix}-admin"
  service_account    = module.runtime_service_account.email
  image              = var.admin_container_image
  container_port     = 80
  min_instance_count = 1
  max_instance_count = 2
  labels             = local.labels
}
