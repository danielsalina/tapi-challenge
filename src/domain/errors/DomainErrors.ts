// ERRORES PERSONALIZADOS DEL DOMINIO
// CADA ERROR TIENE UN CODIGO UNICO PARA FACILITAR EL MANEJO

// CODIGOS DE ERROR
export enum ErrorCode {
  // ERRORES DE LOCK
  LOCK_ACQUIRE_FAILED = "LOCK_ACQUIRE_FAILED",
  LOCK_RELEASE_FAILED = "LOCK_RELEASE_FAILED",
  LOCK_TIMEOUT = "LOCK_TIMEOUT",

  // ERRORES DE API
  API_TIMEOUT = "API_TIMEOUT",
  API_RATE_LIMIT = "API_RATE_LIMIT",
  API_SERVER_ERROR = "API_SERVER_ERROR",
  API_CLIENT_ERROR = "API_CLIENT_ERROR",
  API_UNKNOWN = "API_UNKNOWN",

  // ERRORES DE REPOSITORIO
  SAVE_FAILED = "SAVE_FAILED",
  FIND_FAILED = "FIND_FAILED",

  // ERRORES DE SCHEDULER
  SCHEDULER_NO_JOBS = "SCHEDULER_NO_JOBS",
  SCHEDULER_PUBLISH_FAILED = "SCHEDULER_PUBLISH_FAILED",

  // ERRORES DE VALIDACION
  VALIDATION_FAILED = "VALIDATION_FAILED",
}

// CLASE BASE PARA TODOS LOS ERRORES DEL DOMINIO
export abstract class DomainError extends Error {
  public readonly code: ErrorCode
  public readonly timestamp: string
  public readonly metadata?: Record<string, unknown>

  constructor(code: ErrorCode, message: string, metadata?: Record<string, unknown>) {
    super(message)
    this.name = this.constructor.name
    this.code = code
    this.timestamp = new Date().toISOString()
    this.metadata = metadata

    // CAPTURA EL STACK TRACE CORRECTAMENTE
    Error.captureStackTrace(this, this.constructor)
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      timestamp: this.timestamp,
      metadata: this.metadata,
      stack: this.stack,
    }
  }
}

// ERRORES DE LOCK
export class LockAcquireError extends DomainError {
  constructor(proveedor: string, metadata?: Record<string, unknown>) {
    super(ErrorCode.LOCK_ACQUIRE_FAILED, `No se pudo adquirir lock para proveedor: ${proveedor}`, metadata)
  }
}

export class LockReleaseError extends DomainError {
  constructor(proveedor: string, metadata?: Record<string, unknown>) {
    super(ErrorCode.LOCK_RELEASE_FAILED, `Error al liberar lock para proveedor: ${proveedor}`, metadata)
  }
}

export class LockTimeoutError extends DomainError {
  constructor(proveedor: string, timeoutMs: number, metadata?: Record<string, unknown>) {
    super(ErrorCode.LOCK_TIMEOUT, `Timeout esperando lock para proveedor: ${proveedor}`, {
      proveedor,
      timeoutMs,
      ...metadata,
    })
  }
}

// ERRORES DE API
export class ApiTimeoutError extends DomainError {
  constructor(endpoint: string, metadata?: Record<string, unknown>) {
    super(ErrorCode.API_TIMEOUT, `Timeout llamando a ${endpoint}`, { endpoint, ...metadata })
  }
}

export class ApiRateLimitError extends DomainError {
  constructor(endpoint: string, retryAfter?: number, metadata?: Record<string, unknown>) {
    super(ErrorCode.API_RATE_LIMIT, `Rate limit excedido para ${endpoint}`, { endpoint, retryAfter, ...metadata })
  }
}

export class ApiServerError extends DomainError {
  constructor(endpoint: string, statusCode: number, metadata?: Record<string, unknown>) {
    super(ErrorCode.API_SERVER_ERROR, `Error del servidor ${statusCode} en ${endpoint}`, {
      endpoint,
      statusCode,
      ...metadata,
    })
  }
}

export class ApiClientError extends DomainError {
  constructor(endpoint: string, statusCode: number, metadata?: Record<string, unknown>) {
    super(ErrorCode.API_CLIENT_ERROR, `Error del cliente ${statusCode} en ${endpoint}`, {
      endpoint,
      statusCode,
      ...metadata,
    })
  }
}

// ERRORES DE REPOSITORIO
export class SaveError extends DomainError {
  constructor(entity: string, metadata?: Record<string, unknown>) {
    super(ErrorCode.SAVE_FAILED, `Error guardando ${entity}`, { entity, ...metadata })
  }
}

export class FindError extends DomainError {
  constructor(entity: string, metadata?: Record<string, unknown>) {
    super(ErrorCode.FIND_FAILED, `Error buscando en ${entity}`, { entity, ...metadata })
  }
}

// ERRORES DE SCHEDULER
export class SchedulerNoJobsError extends DomainError {
  constructor(hora: number, fecha: string, metadata?: Record<string, unknown>) {
    super(ErrorCode.SCHEDULER_NO_JOBS, `No hay jobs para hora ${hora} fecha ${fecha}`, { hora, fecha, ...metadata })
  }
}

export class SchedulerPublishError extends DomainError {
  constructor(cantidad: number, metadata?: Record<string, unknown>) {
    super(ErrorCode.SCHEDULER_PUBLISH_FAILED, `Error publicando ${cantidad} jobs`, { cantidad, ...metadata })
  }
}

// ERRORES DE VALIDACION
export class ValidationError extends DomainError {
  constructor(message: string, validationErrors: Record<string, string[]>) {
    super(ErrorCode.VALIDATION_FAILED, message, { validationErrors })
  }
}

// TYPE GUARDS PARA IDENTIFICAR ERRORES
export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}

export function isRetryableError(error: unknown): boolean {
  if (error instanceof DomainError) {
    return [
      ErrorCode.LOCK_ACQUIRE_FAILED,
      ErrorCode.API_TIMEOUT,
      ErrorCode.API_RATE_LIMIT,
      ErrorCode.API_SERVER_ERROR,
    ].includes(error.code)
  }
  return false
}
