output "vpc_id" {
  description = "VPC ID."
  value       = aws_vpc.this.id
}

output "public_subnet_ids" {
  description = "Public subnet IDs."
  value       = aws_subnet.public[*].id
}

output "alb_security_group_id" {
  description = "ALB security group ID."
  value       = aws_security_group.alb.id
}

output "service_security_group_id" {
  description = "Service security group ID."
  value       = aws_security_group.service.id
}
