variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "Cloud SQL region."
}

variable "name" {
  type        = string
  description = "Cloud SQL instance name."
}

variable "network_self_link" {
  type        = string
  description = "Self link of the VPC network used for private IP."
}

variable "database_name" {
  type        = string
  description = "Application database name."
}

variable "username" {
  type        = string
  description = "Application database username."
}

variable "password" {
  type        = string
  description = "Application database password."
  sensitive   = true
}

variable "database_version" {
  type        = string
  description = "Cloud SQL PostgreSQL version."
  default     = "POSTGRES_16"
}

variable "tier" {
  type        = string
  description = "Cloud SQL machine tier."
  default     = "db-custom-2-7680"
}

variable "disk_size_gb" {
  type        = number
  description = "Disk size for the Cloud SQL instance."
  default     = 100
}

variable "availability_type" {
  type        = string
  description = "Cloud SQL availability type."
  default     = "REGIONAL"
}

variable "private_ip_prefix_length" {
  type        = number
  description = "CIDR prefix length for service networking allocation."
  default     = 16
}
