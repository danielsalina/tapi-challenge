import { GetCommand, PutCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { JobResult, QueryJob } from '../../domain/entities/QueryJob';
import { ResultRepository, RegistroRepository } from '../../domain/repositories/ResultRepository';
import { getDynamoClient } from './DynamoClient';
import { config } from '../../config';
import { logger } from '../../config/logger';

// IMPLEMENTACION DYNAMODB DEL REPOSITORIO DE RESULTADOS
export class DynamoResultRepository implements ResultRepository {
  private readonly tableName = config().dynamodb.tableResultados;
  private readonly client = getDynamoClient();

  async save(result: JobResult): Promise<void> {
    // UPSERT - SI YA EXISTE EL RESULTADO DEL DIA LO SOBREESCRIBE
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: {
          // PK COMPUESTA: jobId#fecha GARANTIZA UN RESULTADO POR DIA POR JOB
          pk: `${result.jobId}#${result.fechaEjecucion}`,
          ...result,
          updatedAt: new Date().toISOString(),
        },
      })
    );

    logger.debug('RESULTADO GUARDADO EN DYNAMODB', {
      jobId: result.jobId,
      status: result.status,
      fecha: result.fechaEjecucion,
    });
  }

  async findByJobAndDate(jobId: string, fecha: string): Promise<JobResult | null> {
    const res = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { pk: `${jobId}#${fecha}` },
      })
    );

    if (!res.Item) return null;
    const { pk: _pk, updatedAt: _u, ...rest } = res.Item;
    return rest as JobResult;
  }
}

// IMPLEMENTACION DYNAMODB DEL REPOSITORIO DE REGISTROS
export class DynamoRegistroRepository implements RegistroRepository {
  private readonly tableName = config().dynamodb.tableRegistros;
  private readonly client = getDynamoClient();

  // PAGINACION SIMPLE CON SCAN - PARA PRODUCCION USAR PARALLEL SCAN O S3 EXPORT
  async findByPage(_offset: number, limit: number): Promise<QueryJob[]> {
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        Limit: limit,
      })
    );
    return (result.Items ?? []) as QueryJob[];
  }

  async countAll(): Promise<number> {
    const cfg = config();
    const rawClient = new DynamoDBClient({
      region: cfg.aws.region,
      ...(cfg.aws.endpoint ? { endpoint: cfg.aws.endpoint } : {}),
      ...(cfg.aws.accessKeyId ? {
        credentials: {
          accessKeyId: cfg.aws.accessKeyId,
          secretAccessKey: cfg.aws.secretAccessKey ?? '',
        },
      } : {}),
    });
    const output = await rawClient.send(
      new DescribeTableCommand({ TableName: this.tableName })
    );
    return output.Table?.ItemCount ?? 0;
  }
}
