variable "aws_region" {
  type        = string
  description = "AWS region for deployment."
  default     = "us-east-1"
}

variable "environment" {
  type        = string
  description = "Environment name such as dev, staging, or prod."
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

variable "api_port" {
  type        = number
  default     = 4000
  description = "API container port."
}

