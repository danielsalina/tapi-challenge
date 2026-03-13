# C4 - Diagrama de Contenedores (Nivel 2)

## Arquitectura de Contenedores AWS

flowchart LR
subgraph AWS [Infraestructura AWS]
EB([EventBridge Scheduler])
SL[[Lambda Scheduler]]
SQ[(SQS Job Queue)]
WL[[Lambda Worker Pool]]
DB[(DynamoDB)]
API[Proveedor API interna]
end

    EB -->|Trigger diario| SL
    SL -->|Encola mensajes| SQ
    SQ -->|Escalado automático| WL

    WL -.->|1. Intenta Lock| DB
    WL -->|2. Request HTTP| API
    WL -.->|3. Persiste Resultado| DB

    %% Notas de configuración
    note1(Lambdas: Auto-escalan según demanda)
    note2(DynamoDB: Modo On-demand)

    WL --- note1
    DB --- note2

    style note1 fill:#fff5ad,stroke:#d4a017,stroke-dasharray: 5 5
    style note2 fill:#fff5ad,stroke:#d4a017,stroke-dasharray: 5 5

## Componentes Principales

### EventBridge Scheduler

- Programa ejecución diaria a medianoche UTC
- Alternativa serverless a cron en EC2
- Configurable con expresiones cron

### Lambda Scheduler

- Lee listado de 1M jobs de DynamoDB
- Agrupa/segmenta el trabajo
- Publica mensajes en SQS con MessageGroupId=proveedor

### Cola SQS FIFO

- Bufferiza los jobs
- Desacopla planificador de trabajadores
- Garantiza orden por proveedor con MessageGroupId
- DLQ para mensajes fallidos (max 3 intentos)

### Lambda Worker Pool

- Instancias concurrentes que procesan mensajes
- Auto-escalan según demanda de SQS
  -batch_size=1 para garantizar orden FIFO

### DynamoDB

- Modo on-demand (serverless)
- Tabla de Locks: `pk=lock#{proveedor}` con TTL
- Tabla de Resultados: `pk=jobId#fecha`
- Writes condicionales para atomicidad

### API Interna del Proveedor

- Servicio externo con rate limiting
- Timeout configurado (30s)
- Retry exponencial en errores 5xx

## Tecnologias

- **Compute**: AWS Lambda (Node.js 20)
- **Queue**: SQS FIFO
- **Database**: DynamoDB (on-demand)
- **Scheduler**: EventBridge Scheduler
- **IaC**: Terraform
