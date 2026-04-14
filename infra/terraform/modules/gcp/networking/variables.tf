variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "GCP region."
}

variable "name" {
  type        = string
  description = "VPC name."
}

variable "subnetwork_name" {
  type        = string
  description = "Primary subnetwork name."
}

variable "subnet_cidr" {
  type        = string
  description = "Primary subnet CIDR."
}

variable "pods_secondary_range_name" {
  type        = string
  description = "Secondary range name for pods."
}

variable "pods_secondary_cidr" {
  type        = string
  description = "Secondary CIDR for pods."
}

variable "services_secondary_range_name" {
  type        = string
  description = "Secondary range name for services."
}

variable "services_secondary_cidr" {
  type        = string
  description = "Secondary CIDR for services."
}
