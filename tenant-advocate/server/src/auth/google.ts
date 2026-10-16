import { OAuth2Client } from 'google-auth-library';
import { env } from '../config.js';
import { HttpError } from '../errors.js';
import type { SessionUser } from './session.js';

let client: OAuth2Client | undefined;
const getClient = () => (client ??= new OAuth2Client(env.GOOGLE_CLIENT_ID));

/**
 * Verifies a Google Identity Services ID token (the `credential` the browser receives) and
 * returns the identity to put in our own session. Checks signature, expiry, issuer and that the
 * token was minted for OUR client id.
 */
export async function verifyGoogleCredential(credential: string): Promise<SessionUser> {
  let payload;
  try {
    const ticket = await getClient().verifyIdToken({ idToken: credential, audience: env.GOOGLE_CLIENT_ID });
    payload = ticket.getPayload();
  } catch {
    throw new HttpError(401, 'Invalid Google credential');
  }

  if (!payload?.sub || !payload.email) throw new HttpError(401, 'Google credential has no identity');
  if (!payload.email_verified) throw new HttpError(403, 'Google account email is not verified');

  const email = payload.email.toLowerCase();
  const domain = email.split('@')[1] ?? '';
  const restricted = env.ALLOWED_EMAILS.length > 0 || env.ALLOWED_EMAIL_DOMAINS.length > 0;
  if (restricted && !env.ALLOWED_EMAILS.includes(email) && !env.ALLOWED_EMAIL_DOMAINS.includes(domain)) {
    throw new HttpError(403, 'This account is not allowed to sign in');
  }

  return { sub: payload.sub, email, name: payload.name, picture: payload.picture };
}
