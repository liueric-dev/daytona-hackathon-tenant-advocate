import { AnthropicBedrockMantle } from '@anthropic-ai/bedrock-sdk';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config.js';

/**
 * Both clients expose the same Messages API (`client.messages.create`), so the rest of the app
 * only depends on this shape and the provider is a config switch (MODEL_PROVIDER).
 */
export type LlmClient = { messages: Anthropic['messages'] };

export const MODEL = env.MODEL_PROVIDER === 'bedrock' ? env.BEDROCK_MODEL_ID : env.ANTHROPIC_MODEL;

/** True when the selected provider has enough configuration to attempt a call. */
export function llmConfigured(): boolean {
  if (env.MODEL_PROVIDER === 'anthropic') return Boolean(env.ANTHROPIC_API_KEY);
  const hasCredentials = Boolean(
    env.AWS_BEARER_TOKEN_BEDROCK || env.AWS_PROFILE || (env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY),
  );
  return Boolean(env.AWS_REGION) && hasCredentials;
}

export function llmMissingMessage(): string {
  return env.MODEL_PROVIDER === 'anthropic'
    ? 'ANTHROPIC_API_KEY not set'
    : 'AWS_REGION and AWS credentials not set (AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY [+ AWS_SESSION_TOKEN], or AWS_PROFILE, or AWS_BEARER_TOKEN_BEDROCK)';
}

/**
 * Builds a fresh client. Tracing must be initialised first (see initTracing) so the SDK is patched.
 * The Bedrock client resolves credentials itself using the standard AWS precedence: environment
 * variables, then the shared config/profile chain.
 */
export function createLlm(): LlmClient {
  if (!llmConfigured()) throw new Error(llmMissingMessage());
  return env.MODEL_PROVIDER === 'anthropic'
    ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
    : new AnthropicBedrockMantle({ awsRegion: env.AWS_REGION });
}

let shared: LlmClient | undefined;
export const getLlm = (): LlmClient => (shared ??= createLlm());
