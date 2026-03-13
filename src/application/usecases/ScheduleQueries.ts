import { RegistroRepository } from '../../domain/repositories/ResultRepository';
import { SqsPublisher } from '../../infrastructure/aws/SqsPublisher';
import { config } from '../../config';
import { logger } from '../../config/logger';

interface ScheduleQueriesInput {
  hora: number;       // 0-23 - LA HORA QUE ESTA PROCESANDO ESTE DISPARO
  fecha: string;      // YYYY-MM-DD - FECHA DE LA EJECUCION
  totalRegistros?: number; // OPCIONAL: SI YA SE SABE EL TOTAL
}

interface ScheduleQueriesOutput {
  jobsEncolados: number;
  hora: number;
  fecha: string;
  duracionMs: number;
}

// USE CASE PRINCIPAL DEL SCHEDULER
// RESPONSABILIDAD: LEER LOS REGISTROS DE LA HORA ACTUAL Y PUBLICARLOS EN SQS
export class ScheduleQueriesUseCase {
  constructor(
    private readonly registroRepo: RegistroRepository,
    private readonly sqsPublisher: SqsPublisher
  ) {}

  async execute(input: ScheduleQueriesInput): Promise<ScheduleQueriesOutput> {
    const startTime = Date.now();
    const cfg = config();
    const batchSize = cfg.scheduler.batchSize; // ~41,667 POR HORA PARA 1M DIARIOS

    // CALCULAR OFFSET BASADO EN LA HORA DEL DISPARO
    // HORA 0 -> offset 0, HORA 1 -> offset 41667, etc.
    const offset = input.hora * batchSize;

    logger.info('INICIANDO SCHEDULE DE QUERIES', {
      hora: input.hora,
      fecha: input.fecha,
      offset,
      batchSize,
    });

    // LEER LOS REGISTROS DE ESTE SEGMENTO HORARIO CON PAGINACION
    let totalEncolados = 0;
    let paginaActual = 0;
    const paginaTamano = 1000; // LEER EN CHUNKS DE 1000 PARA NO SATURAR MEMORIA

    while (true) {
      const registros = await this.registroRepo.findByPage(
        offset + paginaActual * paginaTamano,
        paginaTamano
      );

      if (registros.length === 0) break;

      // PUBLICAR EL BATCH EN SQS FIFO
      await this.sqsPublisher.publishBatch(registros, input.fecha);
      totalEncolados += registros.length;
      paginaActual++;

      logger.debug('PAGINA PROCESADA', {
        pagina: paginaActual,
        registrosEnPagina: registros.length,
        totalAcumulado: totalEncolados,
      });

      // SI LEIMOS MENOS DE LO ESPERADO, LLEGAMOS AL FIN DEL SEGMENTO
      if (registros.length < paginaTamano || totalEncolados >= batchSize) break;
    }

    const duracionMs = Date.now() - startTime;

    logger.info('SCHEDULE COMPLETADO', {
      hora: input.hora,
      fecha: input.fecha,
      jobsEncolados: totalEncolados,
      duracionMs,
    });

    return {
      jobsEncolados: totalEncolados,
      hora: input.hora,
      fecha: input.fecha,
      duracionMs,
    };
  }
}
