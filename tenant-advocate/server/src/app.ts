import fs from 'node:fs';
import path from 'node:path';
import express, { type ErrorRequestHandler } from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { ZodError } from 'zod';
import { attachUser, requireAuth, sameOriginOnly } from './auth/middleware.js';
import { authRouter } from './auth/routes.js';
import { isProd, rootDir, serviceStatus } from './config.js';
import { HttpError } from './errors.js';
import { logger } from './logger.js';
import { llmConfigured } from './services/llm.js';

export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  if (isProd) app.set('trust proxy', 1); // correct client IPs for rate limiting behind a proxy

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url === '/api/health' } }));
  app.use(
    helmet({
      // Google Identity Services needs its script, iframe and styles, and a COOP that lets its popup talk back.
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", 'https://accounts.google.com/gsi/client'],
          frameSrc: ['https://accounts.google.com/gsi/'],
          connectSrc: ["'self'", 'https://accounts.google.com/gsi/'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://accounts.google.com/gsi/style'],
          imgSrc: ["'self'", 'data:', 'https://*.googleusercontent.com'],
          // Only force https in production; it breaks a locally served build over http://localhost.
          upgradeInsecureRequests: isProd ? [] : null,
        },
      },
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(sameOriginOnly);
  app.use(attachUser);

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true, uptimeSeconds: Math.round(process.uptime()) });
  });
  app.use('/auth', authRouter);
  app.get('/api/status', requireAuth, (_req, res) => {
    res.json({ services: { ...serviceStatus(), model: llmConfigured() } });
  });

  // In production the server also serves the built web app (single deployable).
  const webDist = path.join(rootDir, 'web', 'dist');
  if (fs.existsSync(webDist)) {
    app.use(express.static(webDist));
    app.get('/{*splat}', (req, res, next) => {
      if (req.path.startsWith('/api/') || req.path.startsWith('/auth/')) return next();
      res.sendFile(path.join(webDist, 'index.html'));
    });
  }

  app.use((_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  const onError: ErrorRequestHandler = (err, req, res, _next) => {
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: err.message });
      return;
    }
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'Invalid request', issues: err.issues.map((i) => i.message) });
      return;
    }
    // Malformed JSON from body-parser and similar client errors
    const status = typeof err?.status === 'number' && err.status >= 400 && err.status < 500 ? err.status : 500;
    if (status === 500) req.log.error({ err }, 'unhandled error');
    res.status(status).json({ error: status === 500 ? 'Internal server error' : 'Bad request' });
  };
  app.use(onError);

  return app;
}
