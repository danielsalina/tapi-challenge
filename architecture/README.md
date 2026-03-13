# Arquitectura Tapi Backend Challenge

## Descripcion General

Este directorio contiene la documentación de arquitectura del sistema, incluyendo diagramas C4 que visualizan la estructura del proyecto.

---

## Diagramas C4

### Estructura de Diagramas

- [`c4-context.md`](c4-context.md) - Diagrama de Contexto (Nivel 1)
- [`c4-container.md`](c4-container.md) - Diagrama de Contenedores (Nivel 2)
- [`c4-component.md`](c4-component.md) - Diagrama de Componentes (Nivel 3)

Los diagramas están definidos en formato Mermaid dentro de los archivos Markdown.

### Visualizacion

Para visualizarlos:

1. Abrir en un editor que soporte Mermaid (VS Code con extensión)
2. O usar [Mermaid Live Editor](https://mermaid.live/)

---

## Estructura del Proyecto

```
tapi-backend-challenge/
├── architecture/           # Diagramas y documentacion
│
├── src/
│   ├── domain/            # Logica de negocio pura (SIN dependencias externas)
│   │   ├── entities/      # QueryJob, JobResult, tipos
│   │   ├── errors/        # DomainErrors (errores personalizados)
│   │   ├── services/      # ErrorClassifierService
│   │   ├── validators/    # InputValidators (Zod schemas)
│   │   └── repositories/  # Contratos (interfaces)
│   │
│   ├── application/       # Casos de uso
│   │   └── usecases/     # ScheduleQueries, ProcessQueryJob
│   │
│   ├── infrastructure/    # Implementaciones concretas AWS
│   │   └── aws/          # DynamoDB, SQS, API Client, Lock Service
│   │
│   ├── main/             # Handlers de Lambda (entry points)
│   │   ├── schedulerLambda.ts
│   │   └── workerLambda.ts
│   │
│   └── config/           # Config multi-ambiente y logger
│
├── tests/
│   ├── unit/             # Tests unitarios con mocks
│   │   ├── domain/       # Tests de dominio
│   │   ├── application/  # Tests de use cases
│   │   └── infrastructure/ # Tests de infraestructura
│   │
│   └── integration/      # Tests con LocalStack
│
└── infra/
    └── terraform/        # Infra as Code
```

---

## Reglas de Arquitectura

### Clean Architecture

1. **Domain** - Cero dependencias externas. Solo lógica de negocio pura
2. **Application** - Solo depende de domain. Nunca importa de infrastructure
3. **Infrastructure** - Implementa los contratos de domain/repositories
4. **Main** - Solo instancia dependencias y llama al use case

### Errores y Validacion

- Usar [`src/domain/errors/DomainErrors.ts`](src/domain/errors/DomainErrors.ts) para errores específicos
- Usar [`src/domain/validators/InputValidators.ts`](src/domain/validators/InputValidators.ts) para validar inputs con Zod

---
