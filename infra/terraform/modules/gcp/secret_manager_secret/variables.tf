variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "secret_id" {
  type        = string
  description = "Secret Manager secret ID."
}

variable "secret_value" {
  type        = string
  description = "Current secret value."
  sensitive   = true
}

variable "accessor_members" {
  type        = list(string)
  description = "IAM members that may access the secret."
  default     = []
}
