import { ErrorClassifierService } from '../../../../src/domain/services/ErrorClassifierService';

// TESTS PUROS DE DOMINIO - SIN DEPENDENCIAS EXTERNAS, RAPIDOS
describe('ErrorClassifierService', () => {
  let service: ErrorClassifierService;

  beforeEach(() => { service = new ErrorClassifierService(); });

  describe('classify()', () => {
    it('DEBE CLASIFICAR 500 COMO REINTENTABLE', () => {
      expect(service.classify(500)).toBe('RETRYABLE');
    });

    it('DEBE CLASIFICAR 502, 503, 504 COMO REINTENTABLES', () => {
      expect(service.classify(502)).toBe('RETRYABLE');
      expect(service.classify(503)).toBe('RETRYABLE');
      expect(service.classify(504)).toBe('RETRYABLE');
    });

    it('DEBE CLASIFICAR 429 (RATE LIMIT) COMO REINTENTABLE', () => {
      expect(service.classify(429)).toBe('RETRYABLE');
    });

    it('DEBE CLASIFICAR TIMEOUT COMO REINTENTABLE SIN IMPORTAR EL STATUS', () => {
      expect(service.classify(undefined, true)).toBe('RETRYABLE');
      expect(service.classify(200, true)).toBe('RETRYABLE');
    });

    it('DEBE CLASIFICAR ERROR DE RED (SIN STATUS) COMO REINTENTABLE', () => {
      expect(service.classify(undefined)).toBe('RETRYABLE');
    });

    it('DEBE CLASIFICAR 400 COMO NO REINTENTABLE', () => {
      expect(service.classify(400)).toBe('NON_RETRYABLE');
    });

    it('DEBE CLASIFICAR 401, 403, 404 COMO NO REINTENTABLES', () => {
      expect(service.classify(401)).toBe('NON_RETRYABLE');
      expect(service.classify(403)).toBe('NON_RETRYABLE');
      expect(service.classify(404)).toBe('NON_RETRYABLE');
    });

    it('DEBE CLASIFICAR 422 COMO NO REINTENTABLE', () => {
      expect(service.classify(422)).toBe('NON_RETRYABLE');
    });

    it('DEBE CLASIFICAR 200 (BUSINESS ERROR EN BODY) COMO NO REINTENTABLE', () => {
      expect(service.classify(200)).toBe('NON_RETRYABLE');
    });
  });

  describe('buildApiError()', () => {
    it('DEBE CONSTRUIR UN API ERROR CON TIPO CORRECTO', () => {
      const error = service.buildApiError(500, 'Internal Server Error');
      expect(error.type).toBe('RETRYABLE');
      expect(error.httpStatus).toBe(500);
      expect(error.message).toBe('Internal Server Error');
    });

    it('DEBE MANEJAR MENSAJE UNDEFINED CON FALLBACK', () => {
      const error = service.buildApiError(404, undefined);
      expect(error.message).toBe('Unknown error');
      expect(error.type).toBe('NON_RETRYABLE');
    });
  });
});
