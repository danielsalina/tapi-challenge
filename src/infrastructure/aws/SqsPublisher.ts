import {
  SQSClient,
  SendMessageBatchCommand,
  SendMessageBatchRequestEntry,
} from '@aws-sdk/client-sqs';
import { createHash } from 'crypto';
import { config } from '../../config';
import { logger } from '../../config/logger';
import { QueryJob } from '../../domain/entities/QueryJob';

// CLIENTE SQS - PUBLICA JOBS EN LA COLA FIFO
// MessageGroupId = proveedor -> GARANTIA DE ORDEN Y ANTI-CONCURRENCIA NATIVA
export class SqsPublisher {
  private readonly client: SQSClient;
  private readonly queueUrl = config().sqs.queueUrl;

  constructor() {
    const cfg = config();
    this.client = new SQSClient({
      region: cfg.aws.region,
      ...(cfg.aws.endpoint ? { endpoint: cfg.aws.endpoint } : {}),
      ...(cfg.aws.accessKeyId
        ? {
            credentials: {
              accessKeyId: cfg.aws.accessKeyId,
              secretAccessKey: cfg.aws.secretAccessKey ?? '',
            },
          }
        : {}),
    });
  }

  /**
   * PUBLICA UN BATCH DE JOBS EN SQS FIFO
   * SQS BATCH SIZE MAXIMO ES 10 MENSAJES POR LLAMADA
   * MessageGroupId = proveedor -> SERIAL POR PROVEEDOR, PARALELO ENTRE PROVEEDORES
   * MessageDeduplicationId = hash(jobId+fecha) -> IDEMPOTENCIA NATIVA DE SQS
   */
  async publishBatch(jobs: QueryJob[], fecha: string): Promise<void> {
    // PARTIR EN CHUNKS DE 10 (LIMITE DE SQS SEND_MESSAGE_BATCH)
    const chunks = this.chunk(jobs, 10);

    for (const chunk of chunks) {
      const entries: SendMessageBatchRequestEntry[] = chunk.map((job) => ({
        Id: job.id, // ID UNICO DENTRO DEL BATCH
        MessageBody: JSON.stringify({ job, fecha }),
        // CLAVE: AGRUPAR POR PROVEEDOR PARA SERIALIZAR SIN CODIGO ADICIONAL
        MessageGroupId: job.proveedor,
        // DEDUPLICACION: MISMO JOB + MISMA FECHA = MISMO MENSAJE (SQS LO DESCARTA)
        MessageDeduplicationId: this.buildDeduplicationId(job.id, fecha),
      }));

      const result = await this.client.send(
        new SendMessageBatchCommand({
          QueueUrl: this.queueUrl,
          Entries: entries,
        })
      );

      if (result.Failed && result.Failed.length > 0) {
        logger.error('FALLO AL PUBLICAR ALGUNOS MENSAJES EN SQS', {
          failed: result.Failed,
        });
      }

      logger.debug('BATCH PUBLICADO EN SQS', {
        total: chunk.length,
        exitosos: result.Successful?.length ?? 0,
        fallidos: result.Failed?.length ?? 0,
      });
    }
  }

  // HASH DETERMINISTA PARA DEDUPLICACION (jobId + fecha = mismo hash siempre)
  private buildDeduplicationId(jobId: string, fecha: string): string {
    return createHash('sha256').update(`${jobId}#${fecha}`).digest('hex').slice(0, 128);
  }

  private chunk<T>(arr: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < arr.length; i += size) chunks.push(arr.slice(i, i + size));
    return chunks;
  }
}
