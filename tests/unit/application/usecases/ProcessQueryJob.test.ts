import { ProcessQueryJobUseCase } from '../../../../src/application/usecases/ProcessQueryJob';
import { QueryJob, ApiError } from '../../../../src/domain/entities/QueryJob';
import { ResultRepository } from '../../../../src/domain/repositories/ResultRepository';
import { ProviderApiClient } from '../../../../src/infrastructure/aws/ProviderApiClient';
import { ProviderLockService } from '../../../../src/infrastructure/aws/ProviderLockService';

// MOCKS DE TODAS LAS DEPENDENCIAS EXTERNAS
// EL USE CASE SE TESTEA EN AISLAMIENTO PURO
const mockResultRepo: jest.Mocked<ResultRepository> = {
  save: jest.fn(),
  findByJobAndDate: jest.fn(),
};

const mockApiClient = {
  call: jest.fn(),
} as unknown as jest.Mocked<ProviderApiClient>;

const mockLockService = {
  acquire: jest.fn(),
  release: jest.fn(),
} as unknown as jest.Mocked<ProviderLockService>;

const JOB_FIXTURE: QueryJob = {
  id: 'job-001',
  proveedor: 'proveedor-a',
  endpoint: '/api/consulta',
  body: { param: 'value' },
};

const FECHA = '2026-03-10';

describe('ProcessQueryJobUseCase', () => {
  let useCase: ProcessQueryJobUseCase;

  beforeEach(() => {
    jest.clearAllMocks();
    useCase = new ProcessQueryJobUseCase(mockResultRepo, mockApiClient, mockLockService);
    // POR DEFECTO: LOCK DISPONIBLE, SIN RESULTADO PREVIO
    mockLockService.acquire.mockResolvedValue(true);
    mockLockService.release.mockResolvedValue(undefined);
    mockResultRepo.findByJobAndDate.mockResolvedValue(null);
    mockResultRepo.save.mockResolvedValue(undefined);
  });

  describe('FLUJO EXITOSO', () => {
    it('DEBE PROCESAR EL JOB Y GUARDAR EL RESULTADO', async () => {
      mockApiClient.call.mockResolvedValue({ data: 'ok' });

      const result = await useCase.execute(JOB_FIXTURE, FECHA);

      expect(result.status).toBe('SUCCESS');
      expect(mockResultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'job-001', status: 'SUCCESS', fechaEjecucion: FECHA })
      );
      expect(mockLockService.acquire).toHaveBeenCalledWith('proveedor-a', expect.any(String));
      expect(mockLockService.release).toHaveBeenCalledWith('proveedor-a');
    });
  });

  describe('IDEMPOTENCIA', () => {
    it('DEBE SALTAR SI EL JOB YA FUE PROCESADO EXITOSAMENTE HOY', async () => {
      mockResultRepo.findByJobAndDate.mockResolvedValue({
        jobId: 'job-001', fechaEjecucion: FECHA, proveedor: 'proveedor-a',
        status: 'SUCCESS', retryCount: 0, executedAt: new Date().toISOString(),
      });

      const result = await useCase.execute(JOB_FIXTURE, FECHA);

      expect(result.status).toBe('ALREADY_PROCESSED');
      expect(mockApiClient.call).not.toHaveBeenCalled(); // NO LLAMA A LA API
      expect(mockResultRepo.save).not.toHaveBeenCalled(); // NO GUARDA DE NUEVO
    });
  });

  describe('MANEJO DE LOCK', () => {
    it('DEBE LANZAR EXCEPCION CUANDO EL LOCK NO ESTA DISPONIBLE', async () => {
      mockLockService.acquire.mockResolvedValue(false);

      await expect(useCase.execute(JOB_FIXTURE, FECHA)).rejects.toThrow('LOCK_UNAVAILABLE');
      expect(mockApiClient.call).not.toHaveBeenCalled();
    });

    it('DEBE LIBERAR EL LOCK INCLUSO SI LA API FALLA', async () => {
      const apiError: ApiError = { type: 'RETRYABLE', message: 'Timeout', httpStatus: 504 };
      mockApiClient.call.mockRejectedValue(apiError);

      await expect(useCase.execute(JOB_FIXTURE, FECHA)).rejects.toBeDefined();
      // FINALLY DEBE HABERSE EJECUTADO
      expect(mockLockService.release).toHaveBeenCalledWith('proveedor-a');
    });
  });

  describe('ERRORES REINTENTABLES', () => {
    it('DEBE GUARDAR EL ESTADO Y RELANZAR LA EXCEPCION PARA QUE SQS REENCOLE', async () => {
      const apiError: ApiError = { type: 'RETRYABLE', message: 'Gateway Timeout', httpStatus: 504 };
      mockApiClient.call.mockRejectedValue(apiError);

      // DEBE LANZAR PARA QUE SQS SEPA QUE DEBE REINTENTAR
      await expect(useCase.execute(JOB_FIXTURE, FECHA)).rejects.toBeDefined();
      // PERO TAMBIEN DEBE GUARDAR EL INTENTO FALLIDO
      expect(mockResultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'BUSINESS_ERROR' })
      );
    });
  });

  describe('ERRORES NO REINTENTABLES', () => {
    it('DEBE GUARDAR ESTADO FAILED Y RETORNAR OK (NO RELANZAR)', async () => {
      const apiError: ApiError = { type: 'NON_RETRYABLE', message: 'Not Found', httpStatus: 404 };
      mockApiClient.call.mockRejectedValue(apiError);

      // NO DEBE LANZAR - SQS NO DEBE REINTENTAR UN 404
      const result = await useCase.execute(JOB_FIXTURE, FECHA);
      expect(result.status).toBe('FAILED');
      expect(mockResultRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'FAILED', httpStatus: 404 })
      );
    });
  });
});
