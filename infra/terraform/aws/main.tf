provider "aws" {
  region = var.aws_region
}

locals {
  prefix = "${var.project_name}-${var.environment}"
  tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

module "networking" {
  source   = "../modules/aws/networking"
  prefix   = local.prefix
  vpc_cidr = "10.40.0.0/16"
  tags     = local.tags
}

resource "aws_iam_role" "task_execution" {
  name = "${local.prefix}-task-exec"

  assume_role_policy = jsonencode({
    Version = "2012-10-17",
    Statement = [{
      Effect = "Allow",
      Principal = {
        Service = "ecs-tasks.amazonaws.com"
      },
      Action = "sts:AssumeRole"
    }]
  })
}

resource "aws_iam_role_policy_attachment" "task_execution" {
  role       = aws_iam_role.task_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_lb" "main" {
  name               = substr(local.prefix, 0, 24)
  internal           = false
  load_balancer_type = "application"
  security_groups    = [module.networking.alb_security_group_id]
  subnets            = module.networking.public_subnet_ids

  tags = local.tags
}

resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.main.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = module.web_service.target_group_arn
  }
}

resource "aws_lb_listener" "admin" {
  load_balancer_arn = aws_lb.main.arn
  port              = 8081
  protocol          = "HTTP"

  default_action {
    type             = "forward"
    target_group_arn = module.admin_service.target_group_arn
  }
}

resource "aws_lb_listener_rule" "api_on_trader_listener" {
  listener_arn = aws_lb_listener.http.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = module.api_service.target_group_arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/health", "/ready", "/ws*"]
    }
  }
}

resource "aws_lb_listener_rule" "api_on_admin_listener" {
  listener_arn = aws_lb_listener.admin.arn
  priority     = 10

  action {
    type             = "forward"
    target_group_arn = module.api_service.target_group_arn
  }

  condition {
    path_pattern {
      values = ["/api/*", "/health", "/ready", "/ws*"]
    }
  }
}

resource "aws_ecs_cluster" "main" {
  name = "${local.prefix}-cluster"

  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

module "api_service" {
  source             = "../modules/aws/ecs_service"
  prefix             = local.prefix
  service_name       = "api"
  cluster_id         = aws_ecs_cluster.main.id
  execution_role_arn = aws_iam_role.task_execution.arn
  container_image    = var.api_container_image
  container_port     = var.api_port
  cpu                = 512
  memory             = 1024
  aws_region         = var.aws_region
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.public_subnet_ids
  security_group_id  = module.networking.service_security_group_id
  health_check_path  = "/health"
  tags               = local.tags
  environment = {
    API_PORT  = tostring(var.api_port)
    API_HOST  = "0.0.0.0"
    DATA_FILE = "/tmp/demo-exchange.json"
  }
}

module "web_service" {
  source             = "../modules/aws/ecs_service"
  prefix             = local.prefix
  service_name       = "web"
  cluster_id         = aws_ecs_cluster.main.id
  execution_role_arn = aws_iam_role.task_execution.arn
  container_image    = var.web_container_image
  container_port     = 80
  cpu                = 256
  memory             = 512
  aws_region         = var.aws_region
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.public_subnet_ids
  security_group_id  = module.networking.service_security_group_id
  health_check_path  = "/"
  tags               = local.tags
}

module "admin_service" {
  source             = "../modules/aws/ecs_service"
  prefix             = local.prefix
  service_name       = "admin"
  cluster_id         = aws_ecs_cluster.main.id
  execution_role_arn = aws_iam_role.task_execution.arn
  container_image    = var.admin_container_image
  container_port     = 80
  cpu                = 256
  memory             = 512
  aws_region         = var.aws_region
  vpc_id             = module.networking.vpc_id
  subnet_ids         = module.networking.public_subnet_ids
  security_group_id  = module.networking.service_security_group_id
  health_check_path  = "/"
  tags               = local.tags
}
