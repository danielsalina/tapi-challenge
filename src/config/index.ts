import * as path from 'path';
import * as fs from 'fs';

// CARGA EL .ENV CORRECTO SEGUN NODE_ENV
// ORDEN DE PRECEDENCIA: .env.{NODE_ENV} > .env > process.env
function loadEnv(): void {
  const env = process.env.NODE_ENV ?? 'sandbox';
  const envFiles = [
    path.resolve(process.cwd(), `.env.${env}`),
    path.resolve(process.cwd(), '.env'),
  ];

  for (const file of envFiles) {
    if (fs.existsSync(file)) {
      const content = fs.readFileSync(file, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const [key, ...rest] = trimmed.split('=');
        const value = rest.join('=');
        // NO SOBREESCRIBIR VARIABLES YA SETEADAS EN EL PROCESO
        if (key && value !== undefined && !process.env[key.trim()]) {
          process.env[key.trim()] = value.trim();
        }
      }
    }
  }
}

loadEnv();

// TIPO FUERTEMENTE TIPADO DE TODA LA CONFIGURACION
export interface AppConfig {
  env: 'sandbox' | 'qa' | 'preprod' | 'production';
  aws: {
    region: string;
    endpoint?: string; // SOLO EN SANDBOX/QA CON LOCALSTACK
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  dynamodb: {
    tableRegistros: string;
    tableResultados: string;
    tableLocks: string;
  };
  sqs: {
    queueUrl: string;
    dlqUrl: string;
    batchSize: number;
    visibilityTimeout: number;
  };
  internalApi: {
    baseUrl: string;
    timeoutMs: number;
    maxRetries: number;
  };
  scheduler: {
    batchSize: number;
    hours: number;
  };
  logging: {
    level: string;
  };
  lock: {
    ttlSeconds: number;
  };
}

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`VARIABLE DE ENTORNO REQUERIDA NO ENCONTRADA: ${key}`);
  return val;
}

export function getConfig(): AppConfig {
  const env = (process.env.NODE_ENV ?? 'sandbox') as AppConfig['env'];
  const isLocal = env === 'sandbox' || env === 'qa';

  return {
    env,
    aws: {
      region: process.env.AWS_REGION ?? 'us-east-1',
      // SOLO INYECTAR ENDPOINT EN AMBIENTES LOCALES
      endpoint: isLocal ? (process.env.AWS_ENDPOINT_URL ?? 'http://localhost:4566') : undefined,
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
    dynamodb: {
      tableRegistros: requireEnv('DYNAMODB_TABLE_REGISTROS'),
      tableResultados: requireEnv('DYNAMODB_TABLE_RESULTADOS'),
      tableLocks: requireEnv('DYNAMODB_TABLE_LOCKS'),
    },
    sqs: {
      queueUrl: requireEnv('SQS_QUEUE_URL'),
      dlqUrl: requireEnv('SQS_DLQ_URL'),
      batchSize: parseInt(process.env.SQS_BATCH_SIZE ?? '10', 10),
      visibilityTimeout: parseInt(process.env.SQS_VISIBILITY_TIMEOUT ?? '300', 10),
    },
    internalApi: {
      baseUrl: requireEnv('INTERNAL_API_BASE_URL'),
      timeoutMs: parseInt(process.env.INTERNAL_API_TIMEOUT_MS ?? '30000', 10),
      maxRetries: parseInt(process.env.INTERNAL_API_MAX_RETRIES ?? '3', 10),
    },
    scheduler: {
      batchSize: parseInt(process.env.SCHEDULER_BATCH_SIZE ?? '41667', 10),
      hours: parseInt(process.env.SCHEDULER_HOURS ?? '24', 10),
    },
    logging: {
      level: process.env.LOG_LEVEL ?? 'info',
    },
    lock: {
      ttlSeconds: parseInt(process.env.LOCK_TTL_SECONDS ?? '300', 10),
    },
  };
}

// SINGLETON DE CONFIG
let _config: AppConfig | null = null;
export function config(): AppConfig {
  if (!_config) _config = getConfig();
  return _config;
}
