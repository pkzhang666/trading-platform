variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "GCP region."
  default     = "us-central1"
}

variable "environment" {
  type        = string
  description = "Environment slug."
}

variable "project_name" {
  type        = string
  description = "Project slug."
  default     = "trading-platform"
}

variable "api_container_image" {
  type        = string
  description = "Full image URI for the API service."
}

variable "web_container_image" {
  type        = string
  description = "Full image URI for the trader web service."
}

variable "admin_container_image" {
  type        = string
  description = "Full image URI for the admin web service."
}

