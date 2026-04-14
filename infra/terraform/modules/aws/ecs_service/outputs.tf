output "target_group_arn" {
  description = "ALB target group ARN."
  value       = aws_lb_target_group.this.arn
}

output "service_name" {
  description = "ECS service name."
  value       = aws_ecs_service.this.name
}
