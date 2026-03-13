# Tapi Backend Challenge

## Arquitectura Serverless AWS para Procesamiento Masivo de Queries

---

## Quick Start (Inicio Rapido)

### Opcion A: Con Docker Compose (Recomendado)

```bash
# 1. Instalar dependencias
npm ci

# 2. Copiar configuracion
cp .env.example .env

# 3. Levantar LocalStack (simula AWS)
docker compose --profile localstack up -d

# 4. Esperar a que LocalStack este listo (~10 segundos)
curl -f http://localhost:4566/_localstack/health

# 5. Poblar la base de datos con datos de prueba
PAGER= bash scripts/localstack-init.sh

# 6. Ejecutar el Scheduler
npm run invoke:scheduler

# 7. En otra terminal, ejecutar el Worker
npm run invoke:worker
```

### Opcion B: Sin Docker - Solo LocalStack

Si prefieres levantar solo LocalStack sin usar profiles:

```bash
# Levantar solo el servicio de LocalStack
docker compose up localstack -d

# Esperar a que este listo
curl -f http://localhost:4566/_localstack/health

# Poblar la base de datos con datos de prueba
PAGER= bash scripts/localstack-init.sh

# Luego ejecutar las lambdas desde tu terminal
npm run dev:scheduler
# Y en otra terminal:
npm run dev:worker
```

### Opcion C: Sin Docker - Todo Local

Si tienes AWS CLI y awslocal instalado, puedes ejecutar todo sin Docker:

```bash
# Instalar awslocal
pip install awscli-local

# Ejecutar directamente (requiere tener LocalStack corriendo en otro lado)
npm run dev:scheduler
npm run dev:worker
```

¿Necesitas más detalles? Continúa leyendo abajo.

---

## El Problema

Procesar **1,000,000 registros diarios** distribuidos en 24 horas, donde cada registro representa una consulta HTTP a una API interna. Restricciones clave:

- Consultas **distribuidas** a lo largo del día (no todas a la vez)
- **Sin concurrencia** hacia el mismo proveedor
- Errores **reintentables vs. definitivos** manejados diferente
- Escala a **N millones** de registros

---

## Solución: Event-Driven Serverless

```
EventBridge (cron/hora)
    │
    ▼
Lambda Scheduler ──► SQS FIFO (MessageGroupId=proveedor)
                              │
                              ▼
                     Lambda Worker Pool
                        │          │
                   DynamoDB    API Interna
                (locks/results)
```

**Por qué SQS FIFO con MessageGroupId:** garantía nativa de no-concURRencia por proveedor. Sin una línea de código extra para serializar. Los DynamoDB locks son una capa adicional de seguridad.

---

## Prerequisitos

Antes de comenzar, asegúrate de tener instalado:

### 1. Docker y Docker Compose

```bash
# Verificar instalación
docker --version
docker compose version
```

Si no tienes Docker, instálalo desde: https://www.docker.com/get-started

### 2. Node.js >= 20

```bash
# Verificar versión
node --version

# Instalar nvm (si no tienes node)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20
```

### 3. AWS CLI y awslocal

```bash
# Instalar AWS CLI
pip install awscli

# Instalar awslocal (para LocalStack)
pip install awscli-local
```

---

## Instalación y Configuración

### Paso 1: Clonar el repositorio

```bash
git clone <repo-url>
cd tapi-backend-challenge
```

### Paso 2: Instalar dependencias

```bash
npm ci
```

### Paso 3: Configurar variables de entorno

```bash
# Copiar el archivo de ejemplo
cp .env.example .env
```

El archivo `.env` ya viene configurado para desarrollo local con LocalStack. Si necesitas ajustarlo:

```bash
# Editar configuración
nano .env
```

Variables importantes:

- `NODE_ENV=sandbox` - Ambiente de desarrollo
- `AWS_ENDPOINT_URL=http://localhost:4566` - Endpoint de LocalStack
- `DYNAMODB_TABLE_REGISTROS=tapi-registros` - Tabla de registros
- `DYNAMODB_TABLE_RESULTADOS=tapi-resultados` - Tabla de resultados
- `DYNAMODB_TABLE_LOCKS=tapi-locks` - Tabla de locks
- `SQS_QUEUE_URL=...` - URL de la cola SQS

---

## Levantar LocalStack (Simula AWS)

### Paso 1: Iniciar LocalStack

```bash
docker compose --profile localstack up -d
```

Esto levantará:

- LocalStack en el puerto 4566
- Servicios simulados: SQS, DynamoDB, EventBridge, Lambda

### Paso 2: Esperar a que LocalStack esté listo

```bash
# Ver logs hasta que aparezca "Ready."
docker compose logs localstack -f
```

O verificar salud:

```bash
curl -f http://localhost:4566/_localstack/health
```

Debería responder con status "available".

### Paso 3: Verificar recursos creados

LocalStack automáticamente crea los recursos definidos en `scripts/localstack-init.sh`:

```bash
# Ver colas SQS
awslocal sqs list-queues

# Ver tablas DynamoDB
awslocal dynamodb list-tables
```

Deberías ver:

- `tapi-jobs.fifo` - Cola principal
- `tapi-jobs-dlq.fifo` - Dead Letter Queue
- `tapi-registros` - Tabla de registros
- `tapi-resultados` - Tabla de resultados
- `tapi-locks` - Tabla de locks

### Paso 4: Verificar datos de prueba

```bash
# Ver registros en la tabla
awslocal dynamodb scan --table-name tapi-registros

# Ver resultados procesados (luego de ejecutar el worker)
docker compose exec localstack aws --endpoint-url=http://localhost:4566 --region us-east-1 dynamodb scan --table-name tapi-resultados
```

Deberías ver 10 registros de prueba.

---

## Ejecutar el Sistema Localmente

### Opción A: Usando npm scripts (Recomendado)

#### 1. Invocar el Scheduler

```bash
npm run invoke:scheduler
```

Esto ejecuta la Lambda Scheduler que:

- Lee los registros de DynamoDB
- Los envía a la cola SQS
- Muestra logs del proceso

#### 2. Invocar el Worker

```bash
npm run invoke:worker
```

Esto ejecuta la Lambda Worker que:

- Lee mensajes de SQS
- Adquiere lock del proveedor
- Llama a la API (mock)
- Guarda resultado en DynamoDB
- Libera el lock

### Opción B: Usando Docker Compose con perfiles

```bash
# Levantar solo LocalStack
docker compose --profile localstack up -d

# Levantar scheduler como proceso
docker compose --profile app up scheduler

# En otra terminal, levitar worker
docker compose --profile app up worker
```

### Opción C: Ejecución directa con ts-node

```bash
# Scheduler
NODE_ENV=sandbox ts-node src/main/schedulerLambda.ts

# Worker
NODE_ENV=sandbox ts-node src/main/workerLambda.ts
```

---

## Ejecutar Tests

### Tests Unitarios (sin dependencias externas)

```bash
npm run test:unit
```

Estos tests:

- No requieren LocalStack
- Usan mocks de DynamoDB y SQS
- Son rápidos (~segundos)

### Tests de Integración (requiere LocalStack)

```bash
# Primero ensure LocalStack está corriendo
docker compose --profile localstack up -d

# Luego ejecutar tests
npm run test:integration
```

Estos tests:

- Usan LocalStack real
- Prueban la integración completa
- Tardan más (~minutos)

### Coverage Completo

```bash
npm run test:coverage
```

Genera reporte de coverage en `coverage/`.

---

## Estructura del Proyecto

```
tapi-backend-challenge/
├── architecture/           # Diagramas C4 y documentación
│   ├── c4-context.md
│   ├── c4-container.md
│   └── c4-component.md
│
├── src/
│   ├── domain/                 # Lógica de negocio pura (sin deps externas)
│   │   ├── entities/           # QueryJob, JobResult, tipos
│   │   ├── services/           # ErrorClassifierService
│   │   └── repositories/       # Contratos (interfaces)
│   │
│   ├── application/            # Casos de uso
│   │   └── usecases/
│   │       ├── ScheduleQueries.ts
│   │       └── ProcessQueryJob.ts
│   │
│   ├── infrastructure/         # Implementaciones concretas AWS
│   │   └── aws/
│   │       ├── DynamoClient.ts
│   │       ├── DynamoResultRepository.ts
│   │       ├── ProviderApiClient.ts
│   │       ├── ProviderLockService.ts
│   │       └── SqsPublisher.ts
│   │
│   ├── main/                   # Handlers de Lambda (entry points)
│   │   ├── schedulerLambda.ts
│   │   └── workerLambda.ts
│   │
│   └── config/                 # Config multi-ambiente y logger
│       ├── index.ts
│       └── logger.ts
│
├── tests/
│   ├── unit/                   # Tests unitarios con mocks
│   └── integration/            # Tests con LocalStack
│
├── infra/
│   └── terraform/              # Infra as Code
│       └── main.tf
│
├── scripts/
│   ├── localstack-init.sh     # Script de inicialización
│   └── invoke-local.js        # Script de invocación local
│
├── docker-compose.yml          # Orquestación de servicios
├── Dockerfile                  # Imagen de las Lambdas
├── package.json
├── tsconfig.json
└── README.md
```

---

## Ambientes

| Ambiente     | AWS | LocalStack | Config         |
| ------------ | --- | ---------- | -------------- |
| `sandbox`    | No  | Si (local) | `.env`         |
| `qa`         | No  | Si (CI/CD) | `.env.qa`      |
| `preprod`    | Si  | No         | `.env.preprod` |
| `production` | Si  | No         | IAM Role       |

### Cambiar de ambiente

```bash
# Sandbox (por defecto)
NODE_ENV=sandbox npm run invoke:scheduler

# QA
NODE_ENV=qa npm run invoke:scheduler
```

---

## Decisiones Arquitectónicas Clave

### Anti-concurrencia por Proveedor

**SQS FIFO + MessageGroupId = proveedor_id** es la solución principal. SQS garantiza que mensajes del mismo grupo se procesan de a uno. Los DynamoDB locks son una capa adicional.

### Clasificación de Errores

- **4xx (400, 401, 403, 404, 422):** No reintentar. El Worker captura, guarda `FAILED` y retorna OK a SQS.
- **5xx + timeout + red:** Reintentar. El Worker relanza la excepción para que SQS haga retry (hasta 3 veces antes de ir al DLQ).

### Distribución Horaria

Con 1M registros y 24 horas: ~41,667 registros/hora. EventBridge dispara el Scheduler cada hora con el offset correcto.

### Idempotencia

- **SQS FIFO:** `MessageDeduplicationId = hash(jobId + fecha)`
- **DynamoDB:** `UNIQUE pk = jobId#fecha` — un resultado por día por job

---

## Desplegar en AWS

### Prerrequisitos

1. AWS CLI configurado
2. Terraform instalado
3. ECR creado para imágenes Lambda

### Deploy con Terraform

```bash
# Ir al directorio de Terraform
cd infra/terraform

# Inicializar Terraform
terraform init

# Plan de despliegue
terraform plan -var="environment=qa" -var="lambda_image_uri=<ECR_URI>"

# Aplicar cambios
terraform apply -var="environment=qa" -var="lambda_image_uri=<ECR_URI>"
```

### Build de la Lambda

```bash
# Build de la imagen Docker
docker build -t tapi-backend:latest .

# Push a ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com
docker tag tapi-backend:latest <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/tapi-backend:latest
docker push <ACCOUNT>.dkr.ecr.us-east-1.amazonaws.com/tapi-backend:latest
```

---

## Costos Estimados (1M jobs/día)

Basado en la propuesta del [AWS Pricing Calculator](https://calculator.aws/#/).

| Servicio         | Detalle                    | Uso                | Costo/mes     |
| ---------------- | -------------------------- | ------------------ | ------------- |
| **Lambda**       | 30M invocaciones           | 30 × $0.20/millón  | ~$6.00        |
|                  | Duración (512MB, 0.2s avg) | 30M×0.2s×0.5GB     | ~$30–$40      |
| **SQS**          | 30M mensajes Standard      | 30 × $0.24/millón  | ~$7.20        |
| **DynamoDB**     | 30M escrituras (Standard)  | 30 × $0.625/millón | ~$18.75       |
|                  | 30M lecturas (Strong)      | 30 × $0.125/millón | ~$3.75        |
|                  | Almacenamiento ~30GB       | 30GB × $0.25/GB    | ~$7.50        |
| **Otras**        | EventBridge, DLQ, Logs     | Uso bajo           | ~$5–$10       |
| **Total aprox.** |                            |                    | **~$70–$120** |

**Nota:** Estos costos asumen la capa gratuita inicial de AWS (1M Lambda free, 400K GB-s, 25GB DB free).

---

## Monitoreo y Observabilidad

### CloudWatch Logs

```bash
# Ver logs del Scheduler
aws logs filter-log-events --log-group-name /aws/lambda/tapi-sandbox-scheduler

# Ver logs del Worker
aws logs filter-log-group-name /aws/lambda/tapi-sandbox-worker
```

### CloudWatch Metrics

Métricas disponibles:

- Invocaciones de Lambda
- Duración
- Errores
- Mensajes en SQS
- Throttling

### X-Ray (Opcional)

Habilitar en la configuración de Lambda para tracing distribuido.

---

## Troubleshooting

### LocalStack no responde

```bash
# Reiniciar LocalStack
docker compose restart localstack

# Ver logs
docker compose logs localstack
```

### Error de permisos en DynamoDB

```bash
# Verificar tablas
awslocal dynamodb list-tables
```

### Error al publicar en SQS

```bash
# Ver cola
awslocal sqs get-queue-url --queue-name tapi-jobs.fifo

# Ver mensajes en cola
awslocal sqs receive-message --queue-url http://localhost:4566/000000000000/tapi-jobs.fifo
```

### Rate Limiting del Proveedor (429)

Si el proveedor tiene un rate limit restrictivo, la API puede devolver 429 (Too Many Requests). El código ya maneja esto automáticamente:

**Qué hace el sistema:**

- Detecta el código 429 y lo trata como error reintentable
- Lee el header `Retry-After` del servidor
- Espera ese tiempo antes de reintentar (en lugar del backoff exponencial estándar)
- Si no hay header, usa backoff exponencial (1s, 2s, 4s...)

**Métricas a monitorear:**

```bash
# Ver mensajes en DLQ (indica muchos 429)
awslocal sqs get-queue-attributes \
  --queue-url http://localhost:4566/000000000000/tapi-jobs-dlq.fifo \
  --attribute-names ApproximateNumberOfMessages
```

**Si el rate limit es muy restrictivo:**

| Solución                       | Cuándo usarla                 | Impacto                      |
| ------------------------------ | ----------------------------- | ---------------------------- |
| Aumentar visibility timeout    | Rate limit bajo pero conocido | Menos reintentos, más espera |
| Reducir concurrency del worker | Para no saturar la API        | Menor throughput             |
| Hablar con el proveedor        | Para aumentar su rate limit   | Ideal                        |

**Configuración avanzada (opcional):**

```bash
# En .env para reducir velocidad de procesamiento
SQS_BATCH_SIZE=1
SQS_VISIBILITY_TIMEOUT=600  # 10 minutos
```

---

## CI/CD

El pipeline de GitHub Actions hace deploy automático:

- **Push a `develop`** → Deploy a QA
- **Push a `main`** → Deploy a Producción con Canary 10%

Workflows en `.github/workflows/`.

---

## Mejoras Futuras

1. **Caching de respuestas**: Implementar cache para respuestas idénticas
2. **Monitoring avanzado**: Alertas para DLQ llena o errores críticos
3. **Optimización de costos**: Auto-scaling basado en métricas de SQS
