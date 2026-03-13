import { createLogger, format, transports, Logger } from 'winston';
import { config } from '../config';

// LOGGER CENTRALIZADO - FORMATO JSON EN PROD, PRETTY EN LOCAL
function buildLogger(): Logger {
  const cfg = config();
  const isLocal = cfg.env === 'sandbox' || cfg.env === 'qa';

  const logFormat = isLocal
    ? format.combine(
        format.colorize(),
        format.timestamp({ format: 'HH:mm:ss' }),
        format.printf(({ timestamp, level, message, ...meta }) => {
          const metaStr = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
          return `${timestamp} [${level}] ${message} ${metaStr}`;
        })
      )
    : format.combine(
        format.timestamp(),
        format.errors({ stack: true }),
        format.json() // FORMATO JSON PARA CLOUDWATCH LOGS INSIGHTS
      );

  return createLogger({
    level: cfg.logging.level,
    format: logFormat,
    defaultMeta: { env: cfg.env, service: 'tapi-backend-challenge' },
    transports: [new transports.Console()],
  });
}

export const logger = buildLogger();
