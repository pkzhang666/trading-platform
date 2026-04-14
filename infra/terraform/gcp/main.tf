provider "google" {
  project = var.project_id
  region  = var.region
}

locals {
  prefix = "${var.project_name}-${var.environment}"
}

resource "google_service_account" "runtime" {
  account_id   = substr(replace(local.prefix, "-", ""), 0, 24)
  display_name = "${local.prefix} runtime"
}

resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "${var.project_name}-${var.environment}"
  description   = "Container images for the trading platform"
  format        = "DOCKER"
}

resource "google_cloud_run_v2_service" "api" {
  name     = "${local.prefix}-api"
  location = var.region

  template {
    service_account = google_service_account.runtime.email
    containers {
      image = var.api_container_image
      env {
        name  = "API_PORT"
        value = "8080"
      }
      env {
        name  = "API_HOST"
        value = "0.0.0.0"
      }
      env {
        name  = "DATA_FILE"
        value = "/tmp/demo-exchange.json"
      }
      ports {
        container_port = 8080
      }
    }
  }
}

resource "google_cloud_run_v2_service" "web" {
  name     = "${local.prefix}-web"
  location = var.region

  template {
    service_account = google_service_account.runtime.email
    containers {
      image = var.web_container_image
      ports {
        container_port = 80
      }
    }
  }
}

resource "google_cloud_run_v2_service" "admin" {
  name     = "${local.prefix}-admin"
  location = var.region

  template {
    service_account = google_service_account.runtime.email
    containers {
      image = var.admin_container_image
      ports {
        container_port = 80
      }
    }
  }
}

resource "google_cloud_run_v2_service_iam_member" "api_public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "web_public" {
  name     = google_cloud_run_v2_service.web.name
  location = google_cloud_run_v2_service.web.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}

resource "google_cloud_run_v2_service_iam_member" "admin_public" {
  name     = google_cloud_run_v2_service.admin.name
  location = google_cloud_run_v2_service.admin.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
