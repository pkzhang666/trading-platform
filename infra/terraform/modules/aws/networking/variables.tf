variable "prefix" {
  type        = string
  description = "Resource name prefix."
}

variable "vpc_cidr" {
  type        = string
  description = "VPC CIDR block."
}

variable "tags" {
  type        = map(string)
  description = "Common tags."
  default     = {}
}
