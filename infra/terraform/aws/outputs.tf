output "alb_dns_name" {
  value       = aws_lb.main.dns_name
  description = "Public ALB DNS for the platform."
}

output "trader_web_url" {
  value       = "http://${aws_lb.main.dns_name}"
  description = "Trader web URL."
}

output "admin_web_url" {
  value       = "http://${aws_lb.main.dns_name}:8081"
  description = "Admin web URL."
}

output "ecs_cluster_name" {
  value       = aws_ecs_cluster.main.name
  description = "ECS cluster name."
}

output "public_subnet_ids" {
  value       = module.networking.public_subnet_ids
  description = "Public subnet IDs."
}
