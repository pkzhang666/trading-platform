variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "Cloud Run region."
}

variable "name" {
  type        = string
  description = "Cloud Run service name."
}

variable "service_account" {
  type        = string
  description = "Runtime service account email."
}

variable "image" {
  type        = string
  description = "Container image."
}

variable "container_port" {
  type        = number
  description = "Container port."
}

variable "environment" {
  type        = map(string)
  description = "Environment variables for the container."
  default     = {}
}

variable "allow_unauthenticated" {
  type        = bool
  description = "Whether to allow unauthenticated invocations."
  default     = true
}

variable "labels" {
  type        = map(string)
  description = "Labels applied to the service."
  default     = {}
}

variable "min_instance_count" {
  type        = number
  description = "Minimum Cloud Run instances."
  default     = 0
}

variable "max_instance_count" {
  type        = number
  description = "Maximum Cloud Run instances."
  default     = 3
}

variable "ingress" {
  type        = string
  description = "Cloud Run ingress setting."
  default     = "INGRESS_TRAFFIC_ALL"
}
