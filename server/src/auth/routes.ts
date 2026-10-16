import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { env } from '../config.js';
import { verifyGoogleCredential } from './google.js';
import { COOKIE_NAME, cookieOptions, createSession } from './session.js';

export const authRouter = Router();

const signInLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 30,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
});

const credentialBody = z.object({ credential: z.string().min(20).max(4096) });

// The web app reads the client id here so it lives in exactly one place (the server's env).
authRouter.get('/config', (_req, res) => {
  res.json({ googleClientId: env.GOOGLE_CLIENT_ID });
});

authRouter.get('/me', (req, res) => {
  if (!req.user) {
    res.status(401).json({ error: 'Not signed in' });
    return;
  }
  res.json({ user: req.user });
});

authRouter.post('/google', signInLimiter, async (req, res) => {
  const { credential } = credentialBody.parse(req.body);
  const user = await verifyGoogleCredential(credential);
  res.cookie(COOKIE_NAME, await createSession(user), cookieOptions());
  res.json({ user });
});

authRouter.post('/logout', (_req, res) => {
  const { maxAge: _maxAge, ...options } = cookieOptions();
  res.clearCookie(COOKIE_NAME, options);
  res.status(204).end();
});
