import { Daytona } from '@daytona/sdk';
import { env } from '../config.js';

let client: Daytona | undefined;

export function getDaytona(): Daytona {
  if (!env.DAYTONA_API_KEY) throw new Error('DAYTONA_API_KEY is not set');
  return (client ??= new Daytona({
    apiKey: env.DAYTONA_API_KEY,
    ...(env.DAYTONA_API_URL ? { apiUrl: env.DAYTONA_API_URL } : {}),
    ...(env.DAYTONA_TARGET ? { target: env.DAYTONA_TARGET } : {}),
  }));
}
