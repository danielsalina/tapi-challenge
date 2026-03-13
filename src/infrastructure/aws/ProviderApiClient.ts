import axios, { AxiosInstance, AxiosError } from "axios"
import axiosRetry from "axios-retry"
import { config } from "../../config"
import { logger } from "../../config/logger"
import { ApiError } from "../../domain/entities/QueryJob"
import { ErrorClassifierService } from "../../domain/services/ErrorClassifierService"

// CLIENTE HTTP PARA LA API INTERNA DEL PROVEEDOR
// IMPLEMENTA RETRY EXPONENCIAL + BACKOFF PARA 429 (RATE LIMIT)
// MANEJA ESPECIALMENTE EL HEADER Retry-After
export class ProviderApiClient {
  private readonly http: AxiosInstance
  private readonly classifier = new ErrorClassifierService()

  constructor() {
    const cfg = config()

    this.http = axios.create({
      baseURL: cfg.internalApi.baseUrl,
      timeout: cfg.internalApi.timeoutMs,
      headers: {
        "Content-Type": "application/json",
        "X-Service": "tapi-backend-challenge",
      },
    })

    // RETRY AUTOMATICO CON BACKOFF EXPONENCIAL
    // MANEJA ESPECIALMENTE 429 (RATE LIMIT) USANDO Retry-After HEADER
    axiosRetry(this.http, {
      retries: cfg.internalApi.maxRetries,
      // BACKOFF: USA Retry-After SI ESTA DISPONIBLE, SINO EXPONENCIAL
      retryDelay: (retryCount, error) => {
        const axiosErr = error as AxiosError
        const retryAfter = axiosErr.response?.headers?.["retry-after"]

        // SI EL SERVIDOR ENVIA Retry-After, USAR ESE VALOR
        if (retryAfter) {
          const delaySeconds = parseInt(retryAfter, 10)
          if (!isNaN(delaySeconds)) {
            logger.info("USANDO Retry-After DEL SERVIDOR", { retryAfter: delaySeconds })
            return delaySeconds * 1000 // CONVERTIR A MILISEGUNDOS
          }
        }

        // BACKOFF EXPONENCIAL POR DEFECTO: 1s, 2s, 4s...
        return axiosRetry.exponentialDelay(retryCount, error)
      },
      shouldResetTimeout: true,
      retryCondition: (error: AxiosError) => {
        const status = error.response?.status
        const isTimeout = error.code === "ECONNABORTED" || error.code === "ETIMEDOUT"

        // SI ES 429 (RATE LIMIT), SIEMPRE REINTENTAR
        if (status === 429) {
          logger.warn("RATE LIMIT DETECTADO - REINTENTANDO", {
            retryAfter: error.response?.headers?.["retry-after"],
            attempt: (error.config as { "axios-retry"?: { retryCount?: number } })?.["axios-retry"]?.retryCount,
          })
          return true
        }

        // PARA OTROS ERRORES, USAR CLASIFICADOR ESTANDAR
        const errorType = this.classifier.classify(status, isTimeout)
        const shouldRetry = errorType === "RETRYABLE"

        if (shouldRetry) {
          logger.warn("REINTENTANDO LLAMADA A API", {
            status,
            isTimeout,
            attempt: (error.config as { "axios-retry"?: { retryCount?: number } })?.["axios-retry"]?.retryCount,
          })
        }

        return shouldRetry
      },
    })
  }

  /**
   * EJECUTA LA LLAMADA POST AL ENDPOINT DEL PROVEEDOR
   * RETORNA EL BODY DE LA RESPUESTA O LANZA ApiError
   */
  async call(endpoint: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
    try {
      const response = await this.http.post<Record<string, unknown>>(endpoint, body)
      logger.debug("LLAMADA A API EXITOSA", { endpoint, status: response.status })
      return response.data
    } catch (err) {
      const axiosErr = err as AxiosError
      const status = axiosErr.response?.status
      const isTimeout = axiosErr.code === "ECONNABORTED" || axiosErr.code === "ETIMEDOUT"

      const apiError: ApiError = this.classifier.buildApiError(status, axiosErr.message, isTimeout, err)

      logger.error("ERROR EN LLAMADA A API", {
        endpoint,
        status,
        errorType: apiError.type,
        message: apiError.message,
      })

      // LANZAR EL ERROR ESTRUCTURADO PARA QUE EL USE CASE LO MANEJE
      throw apiError
    }
  }
}
