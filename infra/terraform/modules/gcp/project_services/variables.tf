variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "services" {
  type        = list(string)
  description = "APIs that must be enabled for the project."
}

variable "disable_on_destroy" {
  type        = bool
  description = "Whether APIs should be disabled when Terraform destroys the stack."
  default     = false
}
