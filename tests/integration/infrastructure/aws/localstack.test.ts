/**
 * TESTS DE INTEGRACION - REQUIEREN LOCALSTACK CORRIENDO
 * EJECUTAR CON: npm run test:integration
 * PREREQUISITO: docker compose --profile localstack up -d
 */

// SOBRESCRIBIR ENV PARA APUNTAR A LOCALSTACK
process.env.NODE_ENV = "sandbox"
process.env.AWS_REGION = "us-east-1"
process.env.AWS_ACCESS_KEY_ID = "test"
process.env.AWS_SECRET_ACCESS_KEY = "test"
process.env.AWS_ENDPOINT_URL = "http://localhost:4566"
process.env.DYNAMODB_TABLE_REGISTROS = "tapi-registros"
process.env.DYNAMODB_TABLE_RESULTADOS = "tapi-resultados"
process.env.DYNAMODB_TABLE_LOCKS = "tapi-locks"
process.env.SQS_QUEUE_URL = "http://localhost:4566/000000000000/tapi-jobs.fifo"
process.env.SQS_DLQ_URL = "http://localhost:4566/000000000000/tapi-jobs-dlq.fifo"
process.env.INTERNAL_API_BASE_URL = "http://localhost:4566/_localstack/mock"
process.env.INTERNAL_API_TIMEOUT_MS = "5000"
process.env.INTERNAL_API_MAX_RETRIES = "1"
process.env.LOCK_TTL_SECONDS = "30"

import { DynamoDBClient, CreateTableCommand } from "@aws-sdk/client-dynamodb"
import { DynamoResultRepository } from "../../../../src/infrastructure/aws/DynamoResultRepository"
import { ProviderLockService } from "../../../../src/infrastructure/aws/ProviderLockService"

const LOCALSTACK_ENDPOINT = "http://localhost:4566"
const REGION = "us-east-1"
const IS_LOCALSTACK_AVAILABLE = process.env.SKIP_INTEGRATION !== "true"

async function createTable(tableName: string, pkName: string) {
  const client = new DynamoDBClient({
    endpoint: LOCALSTACK_ENDPOINT,
    region: REGION,
    credentials: { accessKeyId: "test", secretAccessKey: "test" },
  })
  try {
    await client.send(
      new CreateTableCommand({
        TableName: tableName,
        BillingMode: "PAY_PER_REQUEST",
        AttributeDefinitions: [{ AttributeName: pkName, AttributeType: "S" }],
        KeySchema: [{ AttributeName: pkName, KeyType: "HASH" }],
      }),
    )
  } catch {
    /* TABLA YA EXISTE - OK */
  }
}

describe("INTEGRACION CON LOCALSTACK", () => {
  beforeAll(async () => {
    if (!IS_LOCALSTACK_AVAILABLE) return
    // CREAR TABLAS EN LOCALSTACK ANTES DE LOS TESTS
    await createTable("tapi-resultados", "pk")
    await createTable("tapi-locks", "pk")
    await createTable("tapi-registros", "id")
  }, 30000)

  describe("DynamoResultRepository", () => {
    it("DEBE GUARDAR Y RECUPERAR UN RESULTADO", async () => {
      if (!IS_LOCALSTACK_AVAILABLE) return

      const repo = new DynamoResultRepository()
      const resultado = {
        jobId: "integration-test-001",
        fechaEjecucion: "2026-03-10",
        proveedor: "proveedor-test",
        status: "SUCCESS" as const,
        httpStatus: 200,
        responseBody: { ok: true },
        retryCount: 0,
        executedAt: new Date().toISOString(),
      }

      await repo.save(resultado)
      const encontrado = await repo.findByJobAndDate("integration-test-001", "2026-03-10")

      expect(encontrado).not.toBeNull()
      expect(encontrado?.status).toBe("SUCCESS")
      expect(encontrado?.proveedor).toBe("proveedor-test")
    }, 15000)
  })

  describe("ProviderLockService", () => {
    it("DEBE ADQUIRIR Y LIBERAR UN LOCK CORRECTAMENTE", async () => {
      if (!IS_LOCALSTACK_AVAILABLE) return

      const lockService = new ProviderLockService()
      const proveedor = `test-proveedor-${Date.now()}`

      const adquirido = await lockService.acquire(proveedor, "worker-test-01")
      expect(adquirido).toBe(true)

      // SEGUNDO INTENTO DEBE FALLAR
      const segundoIntento = await lockService.acquire(proveedor, "worker-test-02")
      expect(segundoIntento).toBe(false)

      // LIBERAR
      await lockService.release(proveedor)

      // AHORA DEBE PODER ADQUIRIRSE DE NUEVO
      const despuesDeLiberar = await lockService.acquire(proveedor, "worker-test-03")
      expect(despuesDeLiberar).toBe(true)

      // CLEANUP
      await lockService.release(proveedor)
    }, 15000)
  })
})
