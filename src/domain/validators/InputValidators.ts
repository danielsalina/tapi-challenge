import { z } from "zod"

// SCHEMAS DE VALIDACION DE INPUTS USANDO ZOD
// CADA SCHEMA DEFINE LA FORMA ESPERADA DE LOS DATOS

// -----------------------------------------------------------------------------
// QUERY JOB - ENTIDAD PRINCIPAL
// -----------------------------------------------------------------------------
export const QueryJobSchema = z.object({
  id: z.string().min(1, "ID es requerido"),
  proveedor: z.string().min(1, "Proveedor es requerido"),
  endpoint: z.string().min(1, "Endpoint es requerido"),
  body: z.record(z.string(), z.unknown()),
  createdAt: z.iso.datetime().optional(),
})

export type QueryJobInput = z.infer<typeof QueryJobSchema>

// -----------------------------------------------------------------------------
// SCHEDULE QUERIES - INPUT DEL SCHEDULER
// -----------------------------------------------------------------------------
export const ScheduleQueriesInputSchema = z.object({
  hora: z.number().int().min(0).max(23, "Hora debe estar entre 0 y 23"),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD"),
  totalRegistros: z.number().int().positive().optional(),
})

export type ScheduleQueriesInput = z.infer<typeof ScheduleQueriesInputSchema>

// -----------------------------------------------------------------------------
// PROCESS QUERY JOB - INPUT DEL WORKER
// -----------------------------------------------------------------------------
export const ProcessQueryJobInputSchema = z.object({
  job: QueryJobSchema,
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Fecha debe ser YYYY-MM-DD"),
})

export type ProcessQueryJobInput = z.infer<typeof ProcessQueryJobInputSchema>

// -----------------------------------------------------------------------------
// JOB RESULT - RESULTADO PERSISTIDO
// -----------------------------------------------------------------------------
export const JobResultSchema = z.object({
  jobId: z.string().min(1),
  fechaEjecucion: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proveedor: z.string().min(1),
  status: z.enum(["SUCCESS", "FAILED", "BUSINESS_ERROR", "RETRYING"]),
  httpStatus: z.number().int().optional(),
  responseBody: z.record(z.string(), z.unknown()).optional(),
  errorMessage: z.string().optional(),
  retryCount: z.number().int().min(0),
  executedAt: z.string().datetime(),
})

export type JobResultInput = z.infer<typeof JobResultSchema>

// -----------------------------------------------------------------------------
// VALIDATORS HELPER
// -----------------------------------------------------------------------------
export class InputValidator {
  /**
   * VALIDA UN INPUT Y LANZA ValidationError SI FALLA
   */
  static validate<T>(schema: z.ZodSchema<T>, data: unknown, context?: string): T {
    const result = schema.safeParse(data)

    if (!result.success) {
      const errors: Record<string, string[]> = {}

      for (const issue of result.error.issues) {
        const path = issue.path.join(".")
        if (!errors[path]) {
          errors[path] = []
        }
        errors[path].push(issue.message)
      }

      const message = context
        ? `Validación fallida para ${context}: ${result.error.message}`
        : `Validación fallida: ${result.error.message}`

      // LANZAR ERROR DE VALIDACION CON EL CODIGO Y METADATA
      // ESTE FORMATO ES COMPATIBLE CON ValidationError DE DomainErrors
      const validationError = new Error(message) as Error & { code: string; validationErrors: Record<string, string[]> }
      validationError.name = "ValidationError"
      validationError.code = "VALIDATION_FAILED"
      validationError.validationErrors = errors
      throw validationError
    }

    return result.data
  }

  /**
   * VALIDA Y RETORNA EL RESULTADO O NULL SI FALLA
   */
  static safeValidate<T>(schema: z.ZodSchema<T>, data: unknown): T | null {
    try {
      return this.validate(schema, data)
    } catch {
      return null
    }
  }
}
