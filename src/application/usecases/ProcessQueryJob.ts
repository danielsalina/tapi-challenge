import { v4 as uuidv4 } from 'uuid';
import { QueryJob, JobResult, ApiError } from '../../domain/entities/QueryJob';
import { ResultRepository } from '../../domain/repositories/ResultRepository';
import { ProviderApiClient } from '../../infrastructure/aws/ProviderApiClient';
import { ProviderLockService } from '../../infrastructure/aws/ProviderLockService';
import { logger } from '../../config/logger';

interface ProcessQueryJobOutput {
  status: 'SUCCESS' | 'FAILED' | 'BUSINESS_ERROR' | 'LOCK_UNAVAILABLE' | 'ALREADY_PROCESSED';
  jobId: string;
  duracionMs: number;
}

// USE CASE DEL WORKER - PROCESA UN UNICO JOB DEL QUEUE
// RESPONSABILIDADES:
// 1. VERIFICAR IDEMPOTENCIA (YA FUE PROCESADO HOY?)
// 2. ADQUIRIR LOCK DEL PROVEEDOR
// 3. LLAMAR A LA API INTERNA
// 4. PERSISTIR EL RESULTADO
// 5. LIBERAR EL LOCK
// 6. CLASIFICAR ERRORES (REINTENTABLE VS NO)
export class ProcessQueryJobUseCase {
  private readonly workerId: string;

  constructor(
    private readonly resultRepo: ResultRepository,
    private readonly apiClient: ProviderApiClient,
    private readonly lockService: ProviderLockService
  ) {
    // ID UNICO POR INSTANCIA DE LAMBDA PARA DEBUGGING
    this.workerId = uuidv4().slice(0, 8);
  }

  async execute(job: QueryJob, fecha: string): Promise<ProcessQueryJobOutput> {
    const startTime = Date.now();

    logger.info('PROCESANDO JOB', { jobId: job.id, proveedor: job.proveedor, fecha });

    // PASO 1: IDEMPOTENCIA - SI YA FUE PROCESADO EXITOSAMENTE HOY, SALTAR
    const resultadoExistente = await this.resultRepo.findByJobAndDate(job.id, fecha);
    if (resultadoExistente?.status === 'SUCCESS') {
      logger.info('JOB YA PROCESADO HOY - SALTANDO', { jobId: job.id, fecha });
      return { status: 'ALREADY_PROCESSED', jobId: job.id, duracionMs: Date.now() - startTime };
    }

    // PASO 2: ADQUIRIR LOCK DEL PROVEEDOR (ANTI-CONCURRENCIA)
    // ESTO ES COMPLEMENTARIO AL MessageGroupId DE SQS FIFO
    const lockAdquirido = await this.lockService.acquire(job.proveedor, this.workerId);
    if (!lockAdquirido) {
      // EL PROVEEDOR ESTA SIENDO PROCESADO POR OTRO WORKER
      // LANZAR EXCEPCION PARA QUE SQS REENCOLE EL MENSAJE
      logger.warn('LOCK NO DISPONIBLE - REENCOLANDO', { jobId: job.id, proveedor: job.proveedor });
      throw new Error(`LOCK_UNAVAILABLE: proveedor ${job.proveedor} en proceso`);
    }

    try {
      // PASO 3: LLAMAR A LA API INTERNA
      const responseBody = await this.apiClient.call(job.endpoint, job.body);

      // PASO 4A: PERSISTIR RESULTADO EXITOSO
      const resultado: JobResult = {
        jobId: job.id,
        fechaEjecucion: fecha,
        proveedor: job.proveedor,
        status: 'SUCCESS',
        httpStatus: 200,
        responseBody,
        retryCount: resultadoExistente?.retryCount ?? 0,
        executedAt: new Date().toISOString(),
      };

      await this.resultRepo.save(resultado);
      logger.info('JOB PROCESADO EXITOSAMENTE', { jobId: job.id });
      return { status: 'SUCCESS', jobId: job.id, duracionMs: Date.now() - startTime };

    } catch (err) {
      const apiError = err as ApiError;

      // PASO 4B: PERSISTIR RESULTADO FALLIDO
      const resultado: JobResult = {
        jobId: job.id,
        fechaEjecucion: fecha,
        proveedor: job.proveedor,
        status: apiError.type === 'NON_RETRYABLE' ? 'FAILED' : 'BUSINESS_ERROR',
        httpStatus: apiError.httpStatus,
        errorMessage: apiError.message,
        retryCount: (resultadoExistente?.retryCount ?? 0) + 1,
        executedAt: new Date().toISOString(),
      };

      await this.resultRepo.save(resultado);

      if (apiError.type === 'RETRYABLE') {
        // ERRORES REINTENTABLES: LANZAR EXCEPCION PARA QUE SQS REENCOLE
        logger.warn('ERROR REINTENTABLE - SQS REENCOLA', { jobId: job.id, error: apiError.message });
        throw err; // SQS SE ENCARGA DEL RETRY Y EVENTUALMENTE DEL DLQ
      }

      // ERRORES NO REINTENTABLES: GUARDAR Y RETORNAR OK (NO RELANZAR)
      // SI RELANZAMOS, SQS REINTENTARIA INNECESARIAMENTE UN 400/404
      logger.error('ERROR NO REINTENTABLE - MARCADO COMO FALLIDO', {
        jobId: job.id,
        httpStatus: apiError.httpStatus,
        error: apiError.message,
      });

      return {
        status: resultado.status === 'FAILED' ? 'FAILED' : 'BUSINESS_ERROR',
        jobId: job.id,
        duracionMs: Date.now() - startTime,
      };

    } finally {
      // PASO 5: SIEMPRE LIBERAR EL LOCK (CON O SIN ERROR)
      await this.lockService.release(job.proveedor);
    }
  }
}
