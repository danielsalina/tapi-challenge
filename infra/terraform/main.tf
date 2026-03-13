# =============================================================
# TERRAFORM - INFRAESTRUCTURA COMPLETA TAPI BACKEND CHALLENGE
# RECURSOS: SQS FIFO, DynamoDB, Lambda, EventBridge, IAM, CloudWatch
# USO: terraform apply -var="environment=qa"
# =============================================================

terraform {
  required_version = ">= 1.5.0"
  required_providers {
    aws = { source = "hashicorp/aws", version = "~> 5.0" }
  }
  # ESTADO REMOTO EN S3 (DESCOMENTAR EN PRODUCCION)
  # backend "s3" {
  #   bucket         = "tapi-terraform-state"
  #   key            = "backend-challenge/terraform.tfstate"
  #   region         = "us-east-1"
  #   encrypt        = true
  #   dynamodb_table = "tapi-terraform-locks"
  # }
}

provider "aws" {
  region = var.aws_region
  # EN LOCAL CON LOCALSTACK
  dynamic "endpoints" {
    for_each = var.environment == "sandbox" ? [1] : []
    content {
      sqs      = "http://localhost:4566"
      dynamodb = "http://localhost:4566"
      lambda   = "http://localhost:4566"
    }
  }
}

variable "environment" {
  description = "Ambiente: sandbox | qa | preprod | production"
  type        = string
  default     = "sandbox"
}

variable "aws_region" {
  description = "Region AWS"
  type        = string
  default     = "us-east-1"
}

variable "lambda_image_uri" {
  description = "URI de la imagen Docker en ECR para las Lambdas"
  type        = string
  default     = ""
}

locals {
  prefix      = "tapi-${var.environment}"
  common_tags = {
    Project     = "tapi-backend-challenge"
    Environment = var.environment
    ManagedBy   = "terraform"
  }
}

# -------------------------------------------------------
# SQS FIFO - COLA PRINCIPAL
# -------------------------------------------------------
resource "aws_sqs_queue" "dlq" {
  name                      = "${local.prefix}-jobs-dlq.fifo"
  fifo_queue                = true
  content_based_deduplication = false
  message_retention_seconds = 1209600  # 14 DIAS EN DLQ
  tags                      = local.common_tags
}

resource "aws_sqs_queue" "main" {
  name                       = "${local.prefix}-jobs.fifo"
  fifo_queue                 = true
  content_based_deduplication = false
  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600  # 4 DIAS
  receive_wait_time_seconds  = 20      # LONG POLLING

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 3            # 3 INTENTOS ANTES DE IR AL DLQ
  })

  tags = local.common_tags
}

# -------------------------------------------------------
# DYNAMODB - TABLA DE REGISTROS
# -------------------------------------------------------
resource "aws_dynamodb_table" "registros" {
  name         = "${local.prefix}-registros"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute { name = "id", type = "S" }

  tags = local.common_tags
}

# -------------------------------------------------------
# DYNAMODB - TABLA DE RESULTADOS
# -------------------------------------------------------
resource "aws_dynamodb_table" "resultados" {
  name         = "${local.prefix}-resultados"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"             # pk = jobId#fecha

  attribute { name = "pk", type = "S" }

  tags = local.common_tags
}

# -------------------------------------------------------
# DYNAMODB - TABLA DE LOCKS DISTRIBUIDOS
# -------------------------------------------------------
resource "aws_dynamodb_table" "locks" {
  name         = "${local.prefix}-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "pk"

  attribute { name = "pk", type = "S" }

  # TTL AUTOMATICO PARA LIMPIAR LOCKS HUERFANOS
  ttl {
    attribute_name = "ttl"
    enabled        = true
  }

  tags = local.common_tags
}

# -------------------------------------------------------
# IAM - ROL COMPARTIDO PARA LAMBDAS
# -------------------------------------------------------
resource "aws_iam_role" "lambda_role" {
  name = "${local.prefix}-lambda-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })

  tags = local.common_tags
}

# POLITICA CON PERMISOS MINIMOS (LEAST PRIVILEGE)
resource "aws_iam_role_policy" "lambda_policy" {
  name = "${local.prefix}-lambda-policy"
  role = aws_iam_role.lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:${var.aws_region}:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:DeleteItem", "dynamodb:Query", "dynamodb:Scan", "dynamodb:DescribeTable"]
        Resource = [
          aws_dynamodb_table.registros.arn,
          aws_dynamodb_table.resultados.arn,
          aws_dynamodb_table.locks.arn,
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["sqs:SendMessage", "sqs:SendMessageBatch", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
        Resource = [aws_sqs_queue.main.arn, aws_sqs_queue.dlq.arn]
      },
    ]
  })
}

# -------------------------------------------------------
# CLOUDWATCH - LOG GROUPS
# -------------------------------------------------------
resource "aws_cloudwatch_log_group" "scheduler" {
  name              = "/aws/lambda/${local.prefix}-scheduler"
  retention_in_days = 30
  tags              = local.common_tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${local.prefix}-worker"
  retention_in_days = 30
  tags              = local.common_tags
}

# -------------------------------------------------------
# EVENTBRIDGE - SCHEDULER (DISPARO HORARIO)
# -------------------------------------------------------
resource "aws_scheduler_schedule" "hourly" {
  name        = "${local.prefix}-hourly-trigger"
  group_name  = "default"
  description = "Dispara el Scheduler Lambda cada hora"

  flexible_time_window { mode = "OFF" }

  schedule_expression          = "cron(0 * * * ? *)"    # CADA HORA
  schedule_expression_timezone = "UTC"

  target {
    arn      = aws_lambda_function.scheduler.arn
    role_arn = aws_iam_role.eventbridge_role.arn

    retry_policy {
      maximum_retry_attempts       = 2
      maximum_event_age_in_seconds = 3600
    }
  }
}

resource "aws_iam_role" "eventbridge_role" {
  name = "${local.prefix}-eventbridge-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "scheduler.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "eventbridge_policy" {
  role = aws_iam_role.eventbridge_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["lambda:InvokeFunction"]
      Resource = aws_lambda_function.scheduler.arn
    }]
  })
}

# -------------------------------------------------------
# LAMBDA - SCHEDULER
# -------------------------------------------------------
resource "aws_lambda_function" "scheduler" {
  function_name = "${local.prefix}-scheduler"
  role          = aws_iam_role.lambda_role.arn
  package_type  = "Image"
  image_uri     = var.lambda_image_uri

  memory_size                    = 512
  timeout                        = 900  # 15 MINUTOS (MAXIMO)
  reserved_concurrent_executions = 1    # NUNCA EN PARALELO

  image_config {
    command = ["dist/main/schedulerLambda.handler"]
  }

  environment {
    variables = {
      NODE_ENV                  = var.environment
      AWS_REGION_CUSTOM         = var.aws_region
      DYNAMODB_TABLE_REGISTROS  = aws_dynamodb_table.registros.name
      DYNAMODB_TABLE_RESULTADOS = aws_dynamodb_table.resultados.name
      DYNAMODB_TABLE_LOCKS      = aws_dynamodb_table.locks.name
      SQS_QUEUE_URL             = aws_sqs_queue.main.url
      SQS_DLQ_URL               = aws_sqs_queue.dlq.url
      SCHEDULER_BATCH_SIZE      = "41667"
      LOG_LEVEL                 = var.environment == "production" ? "warn" : "info"
    }
  }

  depends_on = [aws_cloudwatch_log_group.scheduler]
  tags       = local.common_tags
}

# -------------------------------------------------------
# LAMBDA - WORKER
# -------------------------------------------------------
resource "aws_lambda_function" "worker" {
  function_name = "${local.prefix}-worker"
  role          = aws_iam_role.lambda_role.arn
  package_type  = "Image"
  image_uri     = var.lambda_image_uri

  memory_size = 256
  timeout     = 180  # 3 MINUTOS

  image_config {
    command = ["dist/main/workerLambda.handler"]
  }

  environment {
    variables = {
      NODE_ENV                  = var.environment
      DYNAMODB_TABLE_REGISTROS  = aws_dynamodb_table.registros.name
      DYNAMODB_TABLE_RESULTADOS = aws_dynamodb_table.resultados.name
      DYNAMODB_TABLE_LOCKS      = aws_dynamodb_table.locks.name
      SQS_QUEUE_URL             = aws_sqs_queue.main.url
      LOCK_TTL_SECONDS          = "300"
      LOG_LEVEL                 = var.environment == "production" ? "warn" : "info"
    }
  }

  depends_on = [aws_cloudwatch_log_group.worker]
  tags       = local.common_tags
}

# EVENT SOURCE MAPPING: SQS -> WORKER LAMBDA
resource "aws_lambda_event_source_mapping" "sqs_to_worker" {
  event_source_arn                   = aws_sqs_queue.main.arn
  function_name                      = aws_lambda_function.worker.arn
  batch_size                         = 1       # 1 MENSAJE A LA VEZ (GARANTIA FIFO)
  maximum_batching_window_in_seconds = 0
  function_response_types            = ["ReportBatchItemFailures"]  # PARTIAL BATCH
}

# -------------------------------------------------------
# CLOUDWATCH ALARM - DLQ CON MENSAJES (ALERTA)
# -------------------------------------------------------
resource "aws_cloudwatch_metric_alarm" "dlq_not_empty" {
  alarm_name          = "${local.prefix}-dlq-messages"
  alarm_description   = "MENSAJES EN DLQ SUPERARON EL UMBRAL"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 1000  # ALARMAR SI HAY MAS DE 1000 MENSAJES EN DLQ
  treat_missing_data  = "notBreaching"

  dimensions = { QueueName = aws_sqs_queue.dlq.name }
  tags       = local.common_tags
}

# -------------------------------------------------------
# OUTPUTS
# -------------------------------------------------------
output "sqs_queue_url"   { value = aws_sqs_queue.main.url }
output "sqs_dlq_url"     { value = aws_sqs_queue.dlq.url }
output "scheduler_arn"   { value = aws_lambda_function.scheduler.arn }
output "worker_arn"      { value = aws_lambda_function.worker.arn }
