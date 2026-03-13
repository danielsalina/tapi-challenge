// ENTIDAD PRINCIPAL DEL DOMINIO
// REPRESENTA UN REGISTRO DE LA TABLA DE REGISTROS QUE DEBE PROCESARSE
export interface QueryJob {
  id: string;
  proveedor: string;
  endpoint: string;
  body: Record<string, unknown>;
  createdAt?: string;
}

// ESTADOS POSIBLES DE UN JOB PROCESADO
export type JobStatus = 'SUCCESS' | 'FAILED' | 'BUSINESS_ERROR' | 'RETRYING';

// RESULTADO PERSISTIDO TRAS EJECUTAR EL JOB
export interface JobResult {
  jobId: string;          // ID DEL REGISTRO ORIGINAL
  fechaEjecucion: string; // YYYY-MM-DD - UN RESULTADO POR DIA POR JOB
  proveedor: string;
  status: JobStatus;
  httpStatus?: number;
  responseBody?: Record<string, unknown>;
  errorMessage?: string;
  retryCount: number;
  executedAt: string;     // ISO TIMESTAMP
}

// CLASIFICACION DE ERRORES HTTP
export type ErrorType = 'RETRYABLE' | 'NON_RETRYABLE';

export interface ApiError {
  type: ErrorType;
  httpStatus?: number;
  message: string;
  originalError?: unknown;
}
