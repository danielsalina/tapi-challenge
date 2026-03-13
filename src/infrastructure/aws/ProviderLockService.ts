import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { getDynamoClient } from './DynamoClient';
import { config } from '../../config';
import { logger } from '../../config/logger';

// LOCK DISTRIBUIDO USANDO DYNAMODB CONDITIONAL WRITES
// GARANTIZA QUE SOLO UN WORKER PROCESE UN PROVEEDOR A LA VEZ
// ES LA ALTERNATIVA A SQS FIFO - AMBAS ESTRATEGIAS SON VALIDAS
// USAMOS ESTA COMO COMPLEMENTO AL MESSAGEGROUP DE SQS FIFO
export class ProviderLockService {
  private readonly client = getDynamoClient();
  private readonly tableName = config().dynamodb.tableLocks;
  private readonly ttlSeconds = config().lock.ttlSeconds;

  /**
   * INTENTA ADQUIRIR EL LOCK PARA UN PROVEEDOR
   * RETORNA true SI LO ADQUIRIO, false SI YA ESTABA TOMADO
   *
   * MECANISMO: PutItem CON ConditionExpression="attribute_not_exists(pk)"
   * DYNAMODB GARANTIZA ATOMICIDAD DE ESTA OPERACION
   */
  async acquire(proveedor: string, workerId: string): Promise<boolean> {
    const now = Math.floor(Date.now() / 1000);
    const ttl = now + this.ttlSeconds; // TTL PARA EVITAR LOCKS HUERFANOS

    try {
      await this.client.send(
        new PutCommand({
          TableName: this.tableName,
          Item: {
            pk: `lock#${proveedor}`,
            proveedor,
            workerId,    // PARA DEBUG: SABER QUIEN TIENE EL LOCK
            acquiredAt: new Date().toISOString(),
            ttl,         // DYNAMODB BORRA AUTOMATICAMENTE EL ITEM AL EXPIRAR
          },
          // CONDICION ATOMICA: SOLO PONE EL ITEM SI NO EXISTE YA
          ConditionExpression: 'attribute_not_exists(pk)',
        })
      );

      logger.debug('LOCK ADQUIRIDO', { proveedor, workerId });
      return true;
    } catch (err) {
      // ESTE ERROR ESPECIFICO SIGNIFICA QUE OTRO WORKER TIENE EL LOCK
      if (err instanceof ConditionalCheckFailedException) {
        logger.debug('LOCK NO DISPONIBLE - PROVEEDOR YA EN PROCESO', { proveedor });
        return false;
      }
      // CUALQUIER OTRO ERROR ES INESPERADO Y SE PROPAGA
      throw err;
    }
  }

  /**
   * LIBERA EL LOCK DEL PROVEEDOR
   * SE LLAMA AL TERMINAR EL PROCESAMIENTO (EXITO O ERROR)
   */
  async release(proveedor: string): Promise<void> {
    try {
      await this.client.send(
        new DeleteCommand({
          TableName: this.tableName,
          Key: { pk: `lock#${proveedor}` },
        })
      );
      logger.debug('LOCK LIBERADO', { proveedor });
    } catch (err) {
      // SI FALLA LA LIBERACION DEL LOCK, EL TTL LO LIMPIARA AUTOMATICAMENTE
      logger.warn('ERROR AL LIBERAR LOCK - EL TTL LO LIMPIARA', { proveedor, err });
    }
  }
}
