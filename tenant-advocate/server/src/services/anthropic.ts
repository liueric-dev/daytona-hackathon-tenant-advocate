import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config.js';

let client: Anthropic | undefined;

/** Lazy so tracing can patch the SDK first (see initTracing). */
export function getAnthropic(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY is not set');
  return (client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
}

export const MODEL = env.ANTHROPIC_MODEL;
