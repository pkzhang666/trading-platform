variable "prefix" {
  type        = string
  description = "Resource name prefix."
}

variable "service_name" {
  type        = string
  description = "Logical service name."
}

variable "cluster_id" {
  type        = string
  description = "ECS cluster ID."
}

variable "execution_role_arn" {
  type        = string
  description = "Task execution role ARN."
}

variable "container_image" {
  type        = string
  description = "Container image URI."
}

variable "container_port" {
  type        = number
  description = "Container port."
}

variable "cpu" {
  type        = number
  description = "Task CPU."
}

variable "memory" {
  type        = number
  description = "Task memory."
}

variable "aws_region" {
  type        = string
  description = "AWS region."
}

variable "vpc_id" {
  type        = string
  description = "VPC ID."
}

variable "subnet_ids" {
  type        = list(string)
  description = "Subnet IDs."
}

variable "security_group_id" {
  type        = string
  description = "Service security group."
}

variable "health_check_path" {
  type        = string
  description = "Target group health check path."
  default     = "/"
}

variable "desired_count" {
  type        = number
  description = "Desired ECS task count."
  default     = 1
}

variable "assign_public_ip" {
  type        = bool
  description = "Whether to assign public IPs."
  default     = true
}

variable "environment" {
  type        = map(string)
  description = "Container environment variables."
  default     = {}
}

variable "tags" {
  type        = map(string)
  description = "Common tags."
  default     = {}
}
