import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from 'aws-lambda';
import { ProcessQueryJobUseCase } from '../application/usecases/ProcessQueryJob';
import { DynamoResultRepository } from '../infrastructure/aws/DynamoResultRepository';
import { ProviderApiClient } from '../infrastructure/aws/ProviderApiClient';
import { ProviderLockService } from '../infrastructure/aws/ProviderLockService';
import { QueryJob } from '../domain/entities/QueryJob';
import { logger } from '../config/logger';
import { ProcessQueryJobInputSchema, InputValidator } from '../domain/validators/InputValidators';

// DEPENDENCIAS INSTANCIADAS FUERA DEL HANDLER - REUTILIZADAS EN WARM STARTS
const resultRepo = new DynamoResultRepository();
const apiClient = new ProviderApiClient();
const lockService = new ProviderLockService();
const useCase = new ProcessQueryJobUseCase(resultRepo, apiClient, lockService);

// HANDLER DE LAMBDA - PUNTO DE ENTRADA DEL WORKER
// CONSUMIDOR DE SQS FIFO CON REPORTE PARCIAL DE FALLOS
// batchSize=1 EN LA CONFIGURACION PARA GARANTIZAR ORDEN FIFO POR MessageGroup
export const handler = async (event: SQSEvent): Promise<SQSBatchResponse> => {
  const failures: SQSBatchItemFailure[] = [];

  logger.info('WORKER LAMBDA INVOCADA', { mensajes: event.Records.length });

  for (const record of event.Records) {
    let validatedPayload: { job: QueryJob; fecha: string } | null = null;

    // PARSEO Y VALIDACION DEL PAYLOAD
    try {
      const rawPayload = JSON.parse(record.body);
      validatedPayload = InputValidator.validate(
        ProcessQueryJobInputSchema,
        rawPayload,
        'SqsMessagePayload'
      );
    } catch (err) {
      // SI ES ERROR DE VALIDACION, REGISTRAR Y DESCARTAR (NO REINTENTABLE)
      const error = err as Error & { name?: string };
      if (error.name === 'ValidationError') {
        logger.error('PAYLOAD SQS INVALIDO - DESCARTANDO', {
          messageId: record.messageId,
          error: error.message,
        });
        continue;
      }

      // MENSAJE MAL FORMADO JSON - NO REINTENTABLE, IGNORAR
      logger.error('MENSAJE SQS MAL FORMADO - DESCARTANDO', { messageId: record.messageId });
      continue;
    }

    if (!validatedPayload) {
      continue;
    }

    // EJECUCION DEL USE CASE
    try {
      await useCase.execute(validatedPayload.job, validatedPayload.fecha);
    } catch (err) {
      // ERRORES REINTENTABLES: AGREGAR AL REPORTE DE FALLOS
      // SQS REENCOLA SOLO LOS MENSAJES FALLIDOS (PARTIAL BATCH RESPONSE)
      logger.warn('JOB FALLIDO - SERA REENCOLADO POR SQS', {
        messageId: record.messageId,
        jobId: validatedPayload.job?.id,
        err,
      });
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  if (failures.length > 0) {
    logger.warn('BATCH PARCIALMENTE FALLIDO', {
      total: event.Records.length,
      fallidos: failures.length,
    });
  }

  // RETORNAR LOS MENSAJES FALLIDOS PARA QUE SQS LOS REENCOLE
  // LOS MENSAJES NO INCLUIDOS AQUI SE CONSIDERAN EXITOSOS Y SE ELIMINAN
  return { batchItemFailures: failures };
};

// EJECUCION LOCAL PARA DESARROLLO
// VERIFICAMOS SI EL ARCHIVO FUE EJECUTADO DIRECTAMENTE
const isMain = process.argv[1]?.includes('workerLambda.ts');

if (isMain) {
  const mockJob: QueryJob = {
    id: 'test-job-001',
    proveedor: 'proveedor-test',
    endpoint: '/api/v1/consulta',
    body: { param: 'valor-test' },
  };

  const mockEvent: SQSEvent = {
    Records: [{
      messageId: 'mock-msg-001',
      receiptHandle: 'mock-receipt',
      body: JSON.stringify({ job: mockJob, fecha: new Date().toISOString().split('T')[0] }),
      attributes: {
        ApproximateReceiveCount: '1',
        SentTimestamp: Date.now().toString(),
        SenderId: 'mock',
        ApproximateFirstReceiveTimestamp: Date.now().toString(),
      },
      messageAttributes: {},
      md5OfBody: '',
      eventSource: 'aws:sqs',
      eventSourceARN: 'arn:aws:sqs:us-east-1:000000000000:tapi-jobs.fifo',
      awsRegion: 'us-east-1',
    }],
  };

  handler(mockEvent)
    .then((res) => logger.info('EJECUCION LOCAL COMPLETADA', { res }))
    .catch((err) => { logger.error('ERROR EN EJECUCION LOCAL', { err }); process.exit(1); });
}
