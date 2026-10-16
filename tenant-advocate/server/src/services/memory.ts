import { env } from '../config.js';

/**
 * Thin REST client for SurrealDB Agent Memory.
 *
 * Uses the documented REST API directly instead of @surrealdb/memory, which is still an alpha
 * release. Paths and auth follow the hosted quickstart:
 *   POST {endpoint}/api/v1/{context}/facts   write ("remember")
 *   POST {endpoint}/api/v1/{context}/query   read ("recall")
 *   Authorization: Bearer <API key>
 * Writes take `scopes`; reads take `lens`. A misspelled field is silently ignored by the server,
 * so a typo here widens a read to everything the key can see.
 */
export interface MemoryResponse {
  status: number;
  ok: boolean;
  body: unknown;
}

async function post(path: 'facts' | 'query', payload: Record<string, unknown>): Promise<MemoryResponse> {
  const { AGENT_MEMORY_ENDPOINT: endpoint, AGENT_MEMORY_CONTEXT: context, AGENT_MEMORY_API_KEY: apiKey } = env;
  if (!endpoint || !context || !apiKey) {
    throw new Error('AGENT_MEMORY_ENDPOINT, AGENT_MEMORY_CONTEXT and AGENT_MEMORY_API_KEY must all be set');
  }
  const url = `${endpoint.replace(/\/+$/, '')}/api/v1/${encodeURIComponent(context)}/${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(30_000),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* keep raw text */
  }
  return { status: res.status, ok: res.ok, body };
}

export const remember = (text: string, opts: { infer?: string; scopes?: string[] } = {}) =>
  post('facts', { text, infer: opts.infer ?? 'full', ...(opts.scopes ? { scopes: opts.scopes } : {}) });

export const recall = (query: string, opts: { lens?: string[] } = {}) =>
  post('query', { query, ...(opts.lens ? { lens: opts.lens } : {}) });
