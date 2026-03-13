#!/bin/bash
# =============================================================
# LOCALSTACK INIT SCRIPT
# SE EJECUTA AUTOMATICAMENTE CUANDO LOCALSTACK ESTA LISTO
# CREA TODOS LOS RECURSOS AWS NECESARIOS PARA DESARROLLO LOCAL
# =============================================================

set -e

REGION="us-east-1"
ACCOUNT="000000000000"
ENDPOINT="http://localhost:4566"

echo "========================================"
echo "INICIALIZANDO RECURSOS LOCALSTACK..."
echo "========================================"

# --- SQS FIFO COLA PRINCIPAL ---
echo "[SQS] CREANDO COLA FIFO PRINCIPAL..."
aws --endpoint-url=http://localhost:4566 --region us-east-1 sqs create-queue \
  --queue-name "tapi-jobs.fifo" \
  --attributes '{
    "FifoQueue": "true",
    "ContentBasedDeduplication": "false",
    "VisibilityTimeout": "300",
    "MessageRetentionPeriod": "345600",
    "ReceiveMessageWaitTimeSeconds": "20",
    "RedrivePolicy": "{\"deadLetterTargetArn\":\"arn:aws:sqs:us-east-1:000000000000:tapi-jobs-dlq.fifo\",\"maxReceiveCount\":\"3\"}"
  }' \
  --region $REGION || echo "[SQS] COLA YA EXISTE - OK"

# --- SQS FIFO DLQ ---
echo "[SQS] CREANDO DEAD LETTER QUEUE FIFO..."
aws --endpoint-url=http://localhost:4566 --region us-east-1 sqs create-queue \
  --queue-name "tapi-jobs-dlq.fifo" \
  --attributes '{"FifoQueue": "true", "ContentBasedDeduplication": "false"}' \
  --region $REGION || echo "[SQS] DLQ YA EXISTE - OK"

# --- DYNAMODB TABLA DE REGISTROS ---
echo "[DYNAMODB] CREANDO TABLA DE REGISTROS..."
aws --endpoint-url=http://localhost:4566 --region us-east-1 dynamodb create-table \
  --table-name "tapi-registros" \
  --attribute-definitions AttributeName=id,AttributeType=S \
  --key-schema AttributeName=id,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION || echo "[DYNAMODB] TABLA REGISTROS YA EXISTE - OK"

# --- DYNAMODB TABLA DE RESULTADOS ---
echo "[DYNAMODB] CREANDO TABLA DE RESULTADOS..."
aws --endpoint-url=http://localhost:4566 --region us-east-1 dynamodb create-table \
  --table-name "tapi-resultados" \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION || echo "[DYNAMODB] TABLA RESULTADOS YA EXISTE - OK"

# --- DYNAMODB TABLA DE LOCKS ---
echo "[DYNAMODB] CREANDO TABLA DE LOCKS DISTRIBUIDOS..."
aws --endpoint-url=http://localhost:4566 --region us-east-1 dynamodb create-table \
  --table-name "tapi-locks" \
  --attribute-definitions AttributeName=pk,AttributeType=S \
  --key-schema AttributeName=pk,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION || echo "[DYNAMODB] TABLA LOCKS YA EXISTE - OK"

# HABILITAR TTL EN LA TABLA DE LOCKS PARA LIMPIEZA AUTOMATICA
aws --endpoint-url=http://localhost:4566 --region us-east-1 dynamodb update-time-to-live \
  --table-name "tapi-locks" \
  --time-to-live-specification "Enabled=true, AttributeName=ttl" \
  --region $REGION || echo "[DYNAMODB] TTL YA ESTABA HABILITADO - OK"

# --- SEED DE DATOS DE PRUEBA EN REGISTROS ---
echo "[SEED] INSERTANDO DATOS DE PRUEBA..."
for i in $(seq 1 10); do
  aws --endpoint-url=http://localhost:4566 --region us-east-1 dynamodb put-item \
    --table-name "tapi-registros" \
    --item "{
      \"id\": {\"S\": \"registro-${i}\"},
      \"proveedor\": {\"S\": \"proveedor-$(( (i % 3) + 1 ))\"},
      \"endpoint\": {\"S\": \"/api/v1/consulta\"},
      \"body\": {\"S\": \"{\\\"param\\\": \\\"valor-${i}\\\"}\" },
      \"createdAt\": {\"S\": \"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}
    }" \
    --region $REGION 2>/dev/null || true
done

echo ""
echo "========================================"
echo "LOCALSTACK INICIALIZADO CORRECTAMENTE"
echo ""
echo "RECURSOS CREADOS:"
echo "  SQS:      tapi-jobs.fifo"
echo "  SQS DLQ:  tapi-jobs-dlq.fifo"
echo "  DYNAMODB: tapi-registros"
echo "  DYNAMODB: tapi-resultados"
echo "  DYNAMODB: tapi-locks"
echo "  SEED:     10 registros de prueba"
echo ""
echo "ENDPOINT: http://localhost:4566"
echo "========================================"
