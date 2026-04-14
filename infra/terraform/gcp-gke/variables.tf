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

variable "subnet_cidr" {
  type        = string
  description = "Primary subnet CIDR."
  default     = "10.60.0.0/20"
}

variable "pods_secondary_cidr" {
  type        = string
  description = "Secondary CIDR block for pod IPs."
  default     = "10.64.0.0/14"
}

variable "services_secondary_cidr" {
  type        = string
  description = "Secondary CIDR block for service IPs."
  default     = "10.80.0.0/20"
}

variable "enable_private_nodes" {
  type        = bool
  description = "Whether the GKE node pool uses private nodes."
  default     = true
}

variable "master_ipv4_cidr_block" {
  type        = string
  description = "Control plane CIDR for private clusters."
  default     = "172.16.0.0/28"
}

variable "node_machine_type" {
  type        = string
  description = "Machine type for the primary node pool."
  default     = "e2-standard-4"
}

variable "min_node_count" {
  type        = number
  description = "Minimum nodes in the GKE node pool."
  default     = 2
}

variable "max_node_count" {
  type        = number
  description = "Maximum nodes in the GKE node pool."
  default     = 6
}

variable "cloud_sql_tier" {
  type        = string
  description = "Cloud SQL machine tier."
  default     = "db-custom-2-7680"
}

variable "cloud_sql_disk_size_gb" {
  type        = number
  description = "Cloud SQL disk size in GB."
  default     = 100
}
