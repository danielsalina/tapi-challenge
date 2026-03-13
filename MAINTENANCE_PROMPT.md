# Prompt de Mantenimiento - Tapi Backend Challenge

Usá este prompt cuando necesites que un agente de IA te ayude a mantener o evolucionar el sistema.

---

## Prompt Base

```
Sos un desarrollador backend senior especializado en TypeScript, AWS Serverless y Clean Architecture.

Estás trabajando en el proyecto "tapi-backend-challenge", un sistema que:
- Procesa 1,000,000 registros diarios via AWS Lambda + SQS FIFO + DynamoDB
- Usa Clean Architecture: domain → application → infrastructure → main
- Corre en AWS real (preprod/prod) y en LocalStack (sandbox/qa)
- Stack: TypeScript estricto, Node.js 20, AWS SDK v3

REGLAS OBLIGATORIAS:
1. Comentarios en el codigo: SIEMPRE en MAYUSCULAS y SIN ACENTOS
2. NUNCA usar `any` — tipos estrictos o `unknown` con type guards
3. NUNCA saltear capas de Clean Architecture
4. SIEMPRE usar `config()` de src/config/index.ts para leer variables de entorno
5. SIEMPRE agregar tests unitarios para nuevos use cases
6. El logger es `src/config/logger.ts` — NUNCA `console.log`

El contexto completo del proyecto está en AGENTS.md.
```

---

## Prompts Especificos por Tarea

### Agregar Nuevo Tipo de Error
```
Necesito agregar soporte para el codigo HTTP 409 (Conflict) como error reintentable.
Actualmente esta en NON_RETRYABLE_STATUS_CODES en src/domain/services/ErrorClassifierService.ts.
Moverlo a RETRYABLE y actualizar el test correspondiente en tests/unit/ErrorClassifierService.test.ts
```

### Escalar a 10M Registros
```
El sistema actual usa DynamoDB Scan con paginacion para leer registros, lo que no escala bien
a 10M+ registros. Proponé una alternativa usando S3 como buffer:
1. El Scheduler exporta los IDs a procesar en un archivo S3 (CSV/JSON Lines)
2. El Worker lee desde S3 en lugar de DynamoDB scan
3. Mantener compatibilidad con LocalStack para desarrollo local
Seguir Clean Architecture: el cambio va en infrastructure/, no en domain/ ni application/
```

### Agregar Metricas Custom a CloudWatch
```
Agregar metricas custom de CloudWatch en el Worker Lambda:
- jobs_processed_success (contador)
- jobs_processed_failed (contador)
- job_duration_ms (histograma)
El codigo de metricas va en src/infrastructure/aws/MetricsService.ts (nuevo archivo)
El use case ProcessQueryJob debe llamarlo sin conocer la implementacion (inyeccion de dependencias)
```

### Reprocesar Mensajes del DLQ
```
Crear un script en scripts/reprocess-dlq.ts que:
1. Lee todos los mensajes del DLQ (tapi-jobs-dlq.fifo)
2. Los reencola en la cola principal (tapi-jobs.fifo)
3. Acepta --limit N para reprocesar solo N mensajes
4. Acepta --proveedor X para filtrar por proveedor
5. Funciona con LocalStack en sandbox y con AWS real en otros ambientes
```

### Investigar Job Fallido
```
Necesito debuggear por que el job con ID {JOB_ID} del dia {FECHA} aparece como FAILED en DynamoDB.
Ayudame a:
1. Escribir el comando awslocal para buscar el resultado en la tabla tapi-resultados
2. Buscar los logs del Worker en CloudWatch Logs Insights
3. Identificar si fue error reintentable o no reintentable
4. Proponer el fix si es un bug en el codigo
```

---

## Runbook de Operaciones

### Ver mensajes en DLQ
```bash
awslocal sqs receive-message \
  --queue-url http://localhost:4566/000000000000/tapi-jobs-dlq.fifo \
  --max-number-of-messages 10 \
  --attribute-names All
```

### Ver resultado de un job en DynamoDB
```bash
awslocal dynamodb get-item \
  --table-name tapi-resultados \
  --key '{"pk": {"S": "JOB_ID#YYYY-MM-DD"}}'
```

### Forzar ejecucion del Scheduler para una hora especifica
```bash
NODE_ENV=sandbox HORA_OVERRIDE=14 npm run invoke:scheduler
```

### Listar locks activos (debug de concurrencia)
```bash
awslocal dynamodb scan --table-name tapi-locks
```

### Limpiar locks huerfanos manualmente
```bash
awslocal dynamodb delete-item \
  --table-name tapi-locks \
  --key '{"pk": {"S": "lock#NOMBRE_PROVEEDOR"}}'
```
