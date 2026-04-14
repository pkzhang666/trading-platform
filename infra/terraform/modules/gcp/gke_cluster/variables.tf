variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "region" {
  type        = string
  description = "GKE region."
}

variable "name" {
  type        = string
  description = "Cluster name."
}

variable "network" {
  type        = string
  description = "VPC network self link."
}

variable "subnetwork" {
  type        = string
  description = "Subnetwork self link."
}

variable "cluster_secondary_range_name" {
  type        = string
  description = "Secondary range used for pod IPs."
}

variable "services_secondary_range_name" {
  type        = string
  description = "Secondary range used for service IPs."
}

variable "enable_private_nodes" {
  type        = bool
  description = "Whether worker nodes should be private."
  default     = true
}

variable "master_ipv4_cidr_block" {
  type        = string
  description = "CIDR block for the private control plane endpoint."
  default     = "172.16.0.0/28"
}

variable "release_channel" {
  type        = string
  description = "GKE release channel."
  default     = "REGULAR"
}

variable "node_machine_type" {
  type        = string
  description = "Machine type for the primary node pool."
  default     = "e2-standard-4"
}

variable "node_disk_size_gb" {
  type        = number
  description = "Disk size for each node."
  default     = 100
}

variable "min_node_count" {
  type        = number
  description = "Minimum nodes in the autoscaled node pool."
  default     = 2
}

variable "max_node_count" {
  type        = number
  description = "Maximum nodes in the autoscaled node pool."
  default     = 6
}

variable "labels" {
  type        = map(string)
  description = "Cluster and node labels."
  default     = {}
}

variable "network_tags" {
  type        = list(string)
  description = "Network tags applied to nodes."
  default     = []
}
