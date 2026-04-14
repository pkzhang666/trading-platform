variable "project_id" {
  type        = string
  description = "GCP project ID."
}

variable "location" {
  type        = string
  description = "Artifact Registry location."
}

variable "repository_id" {
  type        = string
  description = "Repository ID."
}

variable "description" {
  type        = string
  description = "Repository description."
}
