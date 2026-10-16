import type { CookieOptions } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { env, isProd } from '../config.js';

export interface SessionUser {
  sub: string;
  email: string;
  name?: string;
  picture?: string;
}

const ISSUER = 'tenant-advocate';
const AUDIENCE = 'tenant-advocate-web';

// The __Host- prefix makes browsers insist on Secure + Path=/ + no Domain, so use it where we can.
export const COOKIE_NAME = isProd ? '__Host-ta_session' : 'ta_session';

const secretKey = () => new TextEncoder().encode(env.SESSION_SECRET);

export async function createSession(user: SessionUser): Promise<string> {
  return new SignJWT({ email: user.email, name: user.name, picture: user.picture })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.sub)
    .setIssuer(ISSUER)
    .setAudience(AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(`${env.SESSION_TTL_HOURS}h`)
    .sign(secretKey());
}

/** Returns the user for a valid, unexpired token; null for anything else. Never throws. */
export async function readSession(token: string | undefined): Promise<SessionUser | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey(), {
      issuer: ISSUER,
      audience: AUDIENCE,
      algorithms: ['HS256'],
    });
    if (!payload.sub || typeof payload.email !== 'string') return null;
    return {
      sub: payload.sub,
      email: payload.email,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    };
  } catch {
    return null;
  }
}

export function cookieOptions(): CookieOptions {
  return {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: env.SESSION_TTL_HOURS * 60 * 60 * 1000,
  };
}
