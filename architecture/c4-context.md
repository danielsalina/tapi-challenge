# C4 - Diagrama de Contexto (Nivel 1)

## Sistema de Procesamiento de Queries de Tapi

flowchart TD
Usuario["Usuario de Tapi (Operador)"]

    subgraph Sistema["Sistema de Procesamiento de Queries"]
      direction TB
      EventBridge[EventBridge Scheduler]
      SchedulerLambda["Lambda Planificador"]
      SQSQueue[("SQS Job Queue")]
      WorkerLambda["Lambda Worker"]
      DynamoDB[("DynamoDB")]
      APIInterna["API Interna (Proveedor)"]

      EventBridge --> SchedulerLambda
      SchedulerLambda --> SQSQueue
      SQSQueue --> WorkerLambda
      WorkerLambda --> DynamoDB
      WorkerLambda --> APIInterna
    end

    Usuario -->|Dispara jobs vía Portal| EventBridge

## Descripcion

Este diagrama muestra el contexto general del sistema:

- **Usuario/Operador**: Persona o sistema que interactúa con Tapi
- **EventBridge Scheduler**: Dispara el proceso diariamente a medianoche
- **Lambda Scheduler**: Lee 1M de registros y los distribuye en SQS
- **SQS Queue**: Cola de mensajes que desacopla scheduler de workers
- **Lambda Worker Pool**: Procesa los jobs en paralelo
- **DynamoDB**: Almacena locks (concurrencia) y resultados
- **API Interna**: Proveedor externo con rate limiting

## Flujo de Datos

1. EventBridge dispara Scheduler Lambda a las 00:00 UTC
2. Scheduler Lambda lee registros de DynamoDB y los envía a SQS
3. Workers procesan mensajes de SQS en paralelo
4. Cada worker adquiere lock en DynamoDB antes de llamar a la API
5. Resultados se guardan en DynamoDB
6. Lock se libera para permitir siguiente job del mismo proveedor
