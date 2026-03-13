import type { ScheduledEvent } from "../types/aws-lambda"
import { ScheduleQueriesUseCase } from "../application/usecases/ScheduleQueries"
import { DynamoRegistroRepository } from "../infrastructure/aws/DynamoResultRepository"
import { SqsPublisher } from "../infrastructure/aws/SqsPublisher"
import { logger } from "../config/logger"
import { ScheduleQueriesInputSchema, InputValidator } from "../domain/validators/InputValidators"

// HANDLER DE LAMBDA - PUNTO DE ENTRADA DEL SCHEDULER
// DISPARADO POR EVENTBRIDGE CADA HORA: cron(0 * * * ? *)
// DEPENDENCIAS INSTANCIADAS FUERA DEL HANDLER PARA REUTILIZAR EN WARM STARTS
const registroRepo = new DynamoRegistroRepository()
const sqsPublisher = new SqsPublisher()
const useCase = new ScheduleQueriesUseCase(registroRepo, sqsPublisher)

export const handler = async (event: ScheduledEvent): Promise<void> => {
  // EVENTBRIDGE ENVIA LA HORA EN EL TIME DEL EVENTO
  const now = event.time ? new Date(event.time) : new Date()
  const hora = now.getUTCHours()
  const fecha = now.toISOString().split("T")[0] // YYYY-MM-DD

  logger.info("SCHEDULER LAMBDA INVOCADA", { hora, fecha, source: event.source })

  try {
    // VALIDAR INPUT ANTES DE PROCESAR
    const validatedInput = InputValidator.validate(ScheduleQueriesInputSchema, { hora, fecha }, "ScheduleQueriesInput")

    const result = await useCase.execute(validatedInput)

    logger.info("SCHEDULER LAMBDA COMPLETADA", {
      jobsEncolados: result.jobsEncolados,
      duracionMs: result.duracionMs,
    })
  } catch (err) {
    // CUALQUIER ERROR AQUI HACE QUE EVENTBRIDGE REINTENTE (MAX 2 VECES)
    logger.error("ERROR CRITICO EN SCHEDULER LAMBDA", { err })
    throw err
  }
}

// EJECUCION LOCAL PARA DESARROLLO
// VERIFICAMOS SI EL ARCHIVO FUE EJECUTADO DIRECTAMENTE
const isMain = process.argv[1]?.includes("schedulerLambda.ts")

if (isMain) {
  const mockEvent = {
    source: "aws.scheduler",
    time: new Date().toISOString(),
  } as ScheduledEvent

  handler(mockEvent)
    .then(() => logger.info("EJECUCION LOCAL COMPLETADA"))
    .catch(err => {
      logger.error("ERROR EN EJECUCION LOCAL", { err })
      process.exit(1)
    })
}
