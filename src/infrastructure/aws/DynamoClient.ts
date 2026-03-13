import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { config } from '../../config';

// FACTORY DE CLIENTE DYNAMODB - APUNTA A LOCALSTACK O AWS REAL SEGUN AMBIENTE
function buildDynamoClient(): DynamoDBDocumentClient {
  const cfg = config();

  const baseClient = new DynamoDBClient({
    region: cfg.aws.region,
    // SI HAY ENDPOINT (LOCALSTACK) LO USA, SINO APUNTA A AWS REAL
    ...(cfg.aws.endpoint ? { endpoint: cfg.aws.endpoint } : {}),
    ...(cfg.aws.accessKeyId
      ? {
          credentials: {
            accessKeyId: cfg.aws.accessKeyId,
            secretAccessKey: cfg.aws.secretAccessKey ?? '',
          },
        }
      : {}),
  });

  return DynamoDBDocumentClient.from(baseClient, {
    marshallOptions: {
      removeUndefinedValues: true, // EVITA ERRORES AL GUARDAR CAMPOS OPCIONALES
      convertEmptyValues: false,
    },
  });
}

// SINGLETON DEL CLIENTE
let _dynamoClient: DynamoDBDocumentClient | null = null;
export function getDynamoClient(): DynamoDBDocumentClient {
  if (!_dynamoClient) _dynamoClient = buildDynamoClient();
  return _dynamoClient;
}
