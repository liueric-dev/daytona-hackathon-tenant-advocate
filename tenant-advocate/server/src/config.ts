import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadDotenv } from 'dotenv';
import { z } from 'zod';

// server/src/config.ts and server/dist/config.js are both two levels below the repo root.
export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
loadDotenv({ path: path.join(rootDir, '.env'), quiet: true });

// `KEY=` in a copied .env.example should behave like the variable is unset.
const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optStr = z.preprocess(blankToUndefined, z.string().trim().optional());
const strWithDefault = (d: string) => z.preprocess(blankToUndefined, z.string().trim().default(d));
const csv = z
  .preprocess(blankToUndefined, z.string().optional())
  .transform((v) => (v ? v.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean) : []));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.preprocess(blankToUndefined, z.coerce.number().int().positive().default(3001)),
  WEB_ORIGIN: strWithDefault('http://localhost:5173'),
  LOG_LEVEL: strWithDefault('info'),

  GOOGLE_CLIENT_ID: optStr,
  SESSION_SECRET: optStr,
  SESSION_TTL_HOURS: z.preprocess(blankToUndefined, z.coerce.number().positive().default(168)),
  ALLOWED_EMAILS: csv,
  ALLOWED_EMAIL_DOMAINS: csv,

  // Model provider: 'bedrock' (Claude on Amazon Bedrock) or 'anthropic' (first-party API).
  MODEL_PROVIDER: z.preprocess(blankToUndefined, z.enum(['bedrock', 'anthropic']).default('bedrock')),
  AWS_REGION: optStr,
  AWS_ACCESS_KEY_ID: optStr,
  AWS_SECRET_ACCESS_KEY: optStr,
  AWS_SESSION_TOKEN: optStr,
  AWS_PROFILE: optStr,
  AWS_BEARER_TOKEN_BEDROCK: optStr,
  BEDROCK_MODEL_ID: strWithDefault('anthropic.claude-sonnet-5-5'),
  ANTHROPIC_API_KEY: optStr,
  ANTHROPIC_MODEL: strWithDefault('claude-sonnet-5-5'),

  ARIZE_SPACE_ID: optStr,
  ARIZE_API_KEY: optStr,
  ARIZE_PROJECT_NAME: strWithDefault('tenant-advocate'),

  DAYTONA_API_KEY: optStr,
  DAYTONA_API_URL: optStr,
  DAYTONA_TARGET: optStr,

  AGENT_MEMORY_ENDPOINT: optStr,
  AGENT_MEMORY_CONTEXT: optStr,
  AGENT_MEMORY_API_KEY: optStr,

  SOCRATA_APP_TOKEN: optStr,
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error('Invalid environment configuration:');
  for (const issue of parsed.error.issues) {
    console.error(`  ${issue.path.join('.') || '(root)'}: ${issue.message}`);
  }
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';

/** Variables the web server cannot start without. Smoke tests don't call this. */
export function assertServerEnv(): void {
  const problems: string[] = [];
  if (!env.GOOGLE_CLIENT_ID) problems.push('GOOGLE_CLIENT_ID is not set');
  if (!env.SESSION_SECRET) problems.push('SESSION_SECRET is not set');
  else if (env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET must be at least 32 characters');
  if (isProd && !env.WEB_ORIGIN.startsWith('https://')) problems.push('WEB_ORIGIN must be https:// in production');
  if (problems.length) {
    throw new Error(`Cannot start server:\n  - ${problems.join('\n  - ')}\nSee .env.example.`);
  }
}

/** Which integrations have credentials configured (model status is added in app.ts). Booleans only; never secrets. */
export function serviceStatus() {
  return {
    googleSignIn: Boolean(env.GOOGLE_CLIENT_ID && env.SESSION_SECRET),
    arize: Boolean(env.ARIZE_SPACE_ID && env.ARIZE_API_KEY),
    daytona: Boolean(env.DAYTONA_API_KEY),
    agentMemory: Boolean(env.AGENT_MEMORY_ENDPOINT && env.AGENT_MEMORY_CONTEXT && env.AGENT_MEMORY_API_KEY),
    nycOpenData: true, // public; the app token is optional
  };
}
