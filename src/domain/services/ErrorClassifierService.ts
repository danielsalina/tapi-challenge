import { ApiError, ErrorType } from '../entities/QueryJob';

// LOGICA PURA DE DOMINIO - SIN DEPENDENCIAS EXTERNAS
// CLASIFICA SI UN ERROR ES REINTENTABLE O NO

// ERRORES HTTP QUE SE PUEDEN REINTENTAR (TRANSITORIOS)
const RETRYABLE_STATUS_CODES = new Set([429, 500, 502, 503, 504]);

// ERRORES HTTP QUE NO SE DEBEN REINTENTAR (DEFINITIVOS)
const NON_RETRYABLE_STATUS_CODES = new Set([400, 401, 403, 404, 409, 422]);

export class ErrorClassifierService {
  /**
   * CLASIFICA UN ERROR HTTP COMO REINTENTABLE O NO
   * REGLA: 4xx = NO REINTENTAR (error del cliente/datos)
   *        5xx + timeout = REINTENTAR (error transitorio del servidor)
   */
  classify(httpStatus?: number, isTimeout = false): ErrorType {
    if (isTimeout) return 'RETRYABLE';
    if (!httpStatus) return 'RETRYABLE'; // ERROR DE RED = TRANSITORIO

    if (RETRYABLE_STATUS_CODES.has(httpStatus)) return 'RETRYABLE';
    if (NON_RETRYABLE_STATUS_CODES.has(httpStatus)) return 'NON_RETRYABLE';

    // 2xx CON BODY DE ERROR = BUSINESS ERROR (NO REINTENTAR)
    if (httpStatus >= 200 && httpStatus < 300) return 'NON_RETRYABLE';

    return 'NON_RETRYABLE'; // DEFAULT CONSERVADOR
  }

  /**
   * CONSTRUYE UN ApiError ESTANDARIZADO
   */
  buildApiError(httpStatus?: number, message?: string, isTimeout = false, originalError?: unknown): ApiError {
    const type = this.classify(httpStatus, isTimeout);
    return {
      type,
      httpStatus,
      message: message ?? 'Unknown error',
      originalError,
    };
  }
}
