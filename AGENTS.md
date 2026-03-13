# AGENTS.md - Instrucciones para Agentes de IA

Este archivo define cómo los agentes de IA deben interactuar con este repositorio.

---

## Contexto del Proyecto

Sistema serverless AWS que procesa 1M registros diarios distribuidos en 24 horas.
Stack: TypeScript, Node.js 20, AWS Lambda, SQS FIFO, DynamoDB, EventBridge.
Arquitectura: Clean Architecture (Domain → Application → Infrastructure → Main).

---

## Reglas Obligatorias

### Codigo

- SIEMPRE TypeScript estricto (`strict: true` en tsconfig.json)
- NUNCA `any` — usar tipos correctos o `unknown` con type guards
- SIEMPRE comentarios en MAYUSCULAS y SIN ACENTOS en el codigo
- Funciones de maximo 40 lineas — si es mas largo, extraer en funciones privadas
- SIEMPRE manejar errores con tipos especificos, nunca `catch(e: any)`

### Arquitectura (Clean Architecture)

- `domain/` — CERO dependencias externas. Solo logica de negocio pura
- `application/` — Solo depende de `domain/`. Nunca importa de `infrastructure/`
- `infrastructure/` — Implementa los contratos de `domain/repositories/`
- `main/` — Solo instancia dependencias y llama al use case correspondiente
- NUNCA saltear capas: `main` no llama directo a `infrastructure` sin pasar por `application`

### Testing

- Cada nuevo use case DEBE tener tests unitarios con mocks de todas las dependencias
- Tests de integracion para cada repositorio DynamoDB
- Coverage minimo: 80% en lineas y funciones
- NUNCA usar `jest.mock()` en archivos de dominio — el dominio es puro y no necesita mocks

### AWS / LocalStack

- SIEMPRE testear localmente con LocalStack antes de proponer cambios en infra
- NUNCA hardcodear ARNs o Account IDs — usar variables de entorno
- SIEMPRE usar `config()` del `src/config/index.ts` para leer configuracion
- El endpoint de LocalStack solo se inyecta si `NODE_ENV === 'sandbox' || 'qa'`

---

## Flujo de Trabajo

```
1. Cambios en dominio → actualizar tests unitarios del use case afectado
2. Cambios en infrastructure → actualizar tests de integracion con LocalStack
3. Cambios en infra/terraform → validar con `terraform plan` en sandbox
4. SIEMPRE correr `npm run test:unit` antes de proponer un PR
```

---

## Comandos Clave

```bash
npm run test:unit          # Tests sin dependencias externas
npm run test:integration   # Requiere LocalStack corriendo
npm run localstack:up      # Levantar LocalStack
npm run localstack:setup   # Crear recursos en LocalStack
npm run invoke:scheduler   # Invocar scheduler localmente
npm run invoke:worker      # Invocar worker localmente
npx tsc --noEmit           # Verificar tipos sin compilar
```

---

## Agregar un Nuevo Proveedor o Feature

1. Si el modelo de datos cambia → actualizar `src/domain/entities/QueryJob.ts`
2. Si hay nueva lógica de negocio → agregar en `src/domain/services/`
3. Si hay nuevo caso de uso → agregar en `src/application/usecases/`
4. Si hay nueva infra AWS → agregar en `src/infrastructure/aws/` + recurso Terraform
5. Si hay nuevos errores específicos → agregar en `src/domain/errors/`
6. Si hay validación de inputs → agregar en `src/domain/validators/` con Zod
7. Actualizar el `scripts/localstack-init.sh` si se crean nuevas tablas/colas

---

## NO hacer

- NO modificar `.env` — es el archivo de ejemplo. Las credenciales reales van en `.env.local` (gitignored)
- NO subir secretos al repo. Usar `scripts/localstack-init.sh` solo para datos de prueba
- NO agregar dependencias sin revisar si ya existe algo en el proyecto que lo resuelva
- NO usar `console.log` — siempre usar el `logger` de `src/config/logger.ts`
- NO crear recursos AWS en el codigo (crear tablas/colas desde el codigo de la app) — eso va en Terraform o en `localstack-init.sh`
