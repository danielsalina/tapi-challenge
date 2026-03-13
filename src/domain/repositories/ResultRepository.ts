import { JobResult, QueryJob } from '../entities/QueryJob';

// CONTRATO DE DOMINIO PARA PERSISTENCIA DE RESULTADOS
// LA IMPLEMENTACION REAL VIVE EN INFRASTRUCTURE/
export interface ResultRepository {
  save(result: JobResult): Promise<void>;
  findByJobAndDate(jobId: string, fecha: string): Promise<JobResult | null>;
}

// CONTRATO PARA LEER LOS REGISTROS A PROCESAR
export interface RegistroRepository {
  findByPage(offset: number, limit: number): Promise<QueryJob[]>;
  countAll(): Promise<number>;
}
