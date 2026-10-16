import type { NextFunction, Request, Response } from 'express';
import { env } from '../config.js';
import { COOKIE_NAME, readSession, type SessionUser } from './session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: SessionUser;
    }
  }
}

/** Populates req.user from the session cookie, if there is a valid one. */
export async function attachUser(req: Request, _res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers.cookie ?? '')
    .split(';')
    .map((c) => c.trim())
    .find((c) => c.startsWith(`${COOKIE_NAME}=`))
    ?.slice(COOKIE_NAME.length + 1);
  const user = await readSession(token ? decodeURIComponent(token) : undefined);
  if (user) req.user = user;
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Sign in required' });
    return;
  }
  next();
}

/**
 * CSRF defence for cookie auth: browsers always send Origin on cross-site POSTs, so any
 * state-changing request that names a different origin is rejected. (SameSite=Lax on the
 * cookie is the second layer.)
 */
export function sameOriginOnly(req: Request, res: Response, next: NextFunction): void {
  const safe = req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
  const origin = req.headers.origin;
  if (!safe && origin && origin !== env.WEB_ORIGIN) {
    res.status(403).json({ error: 'Cross-origin request blocked' });
    return;
  }
  next();
}
