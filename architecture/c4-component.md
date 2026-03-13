# C4 - Diagrama de Componentes (Nivel 3)

## Componentes Internos de las Lambdas

```mermaid
flowchart TB
  subgraph SchedulerLambda
    A[Configuracion de AWS SDK]
    B[Consulta IDs de jobs] --> C[SQS Producer]
  end
  subgraph WorkerLambda
    D[SqsConsumer<br>AWS Lambda Event] --> E[ProviderLockService]
    E --> F[DynamoDB.lockTable conditional write]
    E --> G[RetryPolicyService]
    D --> H[ProviderClient HTTP]
    H --> I[Proveedor API]
    H --> G
    H --> J[ErrorHandler]
    J --> K[SQS DLQ]
    H --> L[ResultRepository]
    L --> M[DynamoDB.resultsTable]
  end
```

## Lambda Scheduler - Componentes

### Configuracion AWS SDK

- Inicializa clientes DynamoDB y SQS
- Configura región y credentials

### Consulta IDs de Jobs

- Lee registros de DynamoDB por página
- Calcula offset basado en la hora

### SQS Producer

- Publica mensajes en cola FIFO
- MessageGroupId = proveedor
- MessageDeduplicationId = hash(jobId + fecha)

## Lambda Worker - Componentes

### SqsConsumer

- Recibe evento SQS
- Extrae mensaje del body
- Parsea job y fecha

### ProviderLockService

- Intenta acquire lock con PutItem condicional
- ConditionExpression: `attribute_not_exists(pk)`
- Retorna true/false

### ProviderClient HTTP

- Llama a API interna con axios
- Implementa retry exponencial
- Timeout configurado

### RetryPolicyService

- Clasifica errores (RETRYABLE vs NON_RETRYABLE)
- 4xx = no reintentar
- 5xx + timeout = reintentar

### ErrorHandler

- Maneja errores no recuperables
- Envía a DLQ si max retries

### ResultRepository

- Persiste resultado en DynamoDB
- pk = jobId#fecha (único por día)

## Diagrama de Secuencia

```mermaid
sequenceDiagram
    participant SchedLambda as Scheduler Lambda
    participant SQS as SQS Queue
    participant WorkerLambda as Worker Lambda
    participant DynamoDB as DynamoDB (Lock/Results)
    participant Provider as API Proveedor

    Note over SchedLambda: Cada dia a las 00:00
    SchedLambda->>SQS: Envia <1M mensajes de consulta
    loop Para cada mensaje
        WorkerLambda->>DynamoDB: PutItem condicional (lock provider)
        alt Lock exitoso
            DynamoDB-->>WorkerLambda: OK
            WorkerLambda->>Provider: POST /endpoint con body
            alt Respuesta 2xx
                Provider-->>WorkerLambda: Respuesta
                WorkerLambda->>DynamoDB: Guardar resultado exitoso
            else Error/Peticion fallida
                WorkerLambda->>DynamoDB: Guardar estado ERROR (retry)
                WorkerLambda->>WorkerLambda: Lanzar excepcion -> SQS reenqueue
            end
            WorkerLambda->>DynamoDB: Liberar lock
        else Lock ocupado
            DynamoDB-->>WorkerLambda: ConditionalCheckFailed
            WorkerLambda->>SQS: Volver a encolar el mensaje
        end
    end
```
