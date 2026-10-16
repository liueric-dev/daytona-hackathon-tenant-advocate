import { createApp } from './app.js';
import { assertServerEnv, env } from './config.js';
import { logger } from './logger.js';
import { initTracing, shutdownTracing } from './services/tracing.js';

assertServerEnv();
initTracing(); // before anything creates an Anthropic client

const app = createApp();
const server = app.listen(env.PORT, () => {
  logger.info({ port: env.PORT, origin: env.WEB_ORIGIN }, 'server listening');
});

let stopping = false;
async function shutdown(signal: string) {
  if (stopping) return;
  stopping = true;
  logger.info({ signal }, 'shutting down');
  server.close();
  await shutdownTracing().catch((err) => logger.error({ err }, 'tracing shutdown failed'));
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
