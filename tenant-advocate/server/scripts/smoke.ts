/**
 * Connectivity smoke tests for every external service.
 *
 *   npm run smoke                 run everything
 *   npm run smoke -- hpd model    run only the named checks
 *
 * Each check reports pass / fail / skip (skip = credentials not set). Exit code is 1 if any
 * check fails, so this can gate a deploy. Run it from a machine with normal internet access.
 */
import Anthropic from '@anthropic-ai/sdk';
import { DiagLogLevel, diag } from '@opentelemetry/api';
import { env } from '../src/config.js';
import { getAnthropic, MODEL } from '../src/services/anthropic.js';
import { getDaytona } from '../src/services/daytona.js';
import {
  COMPLAINT_FIELDS,
  HPD_DATASETS,
  queryHpd,
  VIOLATION_FIELDS,
  type HpdDataset,
} from '../src/services/hpd.js';
import { recall, remember } from '../src/services/memory.js';
import { ARIZE_OTLP_URL, flushTracing, initTracing, shutdownTracing, traced } from '../src/services/tracing.js';

type Outcome = { status: 'pass' | 'skip'; detail: string };

const short = (v: unknown, n = 300) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > n ? `${s.slice(0, n)}…` : s;
};

async function datasetColumns(dataset: HpdDataset): Promise<string[]> {
  const res = await fetch(`https://data.cityofnewyork.us/api/views/${HPD_DATASETS[dataset]}`, {
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`column metadata for ${dataset} returned ${res.status}`);
  const meta = (await res.json()) as { columns?: { fieldName: string }[] };
  return (meta.columns ?? []).map((c) => c.fieldName);
}

const checks: Record<string, () => Promise<Outcome>> = {
  async config() {
    const problems: string[] = [];
    if (!env.GOOGLE_CLIENT_ID?.endsWith('.apps.googleusercontent.com')) {
      problems.push('GOOGLE_CLIENT_ID should end in .apps.googleusercontent.com');
    }
    if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) problems.push('SESSION_SECRET must be 32+ chars');
    try {
      new URL(env.WEB_ORIGIN);
    } catch {
      problems.push('WEB_ORIGIN is not a valid URL');
    }
    if (problems.length) throw new Error(problems.join('; '));
    return { status: 'pass', detail: `Google client id and session secret look valid; origin ${env.WEB_ORIGIN}` };
  },

  async hpd() {
    const notes: string[] = [];
    for (const [dataset, wanted] of [
      ['violations', VIOLATION_FIELDS],
      ['complaints', COMPLAINT_FIELDS],
    ] as const) {
      const columns = await datasetColumns(dataset);
      const missing = wanted.filter((f) => !columns.includes(f));
      if (missing.length) throw new Error(`${dataset}: expected columns missing from dataset: ${missing.join(', ')}`);

      const rows = await queryHpd(dataset, { limit: 1 });
      if (rows.length === 0) throw new Error(`${dataset}: query returned no rows`);
      notes.push(`${dataset}: ${columns.length} columns, all ${wanted.length} expected present, sample row ok`);
    }
    return { status: 'pass', detail: notes.join(' | ') };
  },

  async model() {
    if (!env.ANTHROPIC_API_KEY) return { status: 'skip', detail: 'ANTHROPIC_API_KEY not set' };
    const msg = await getAnthropic().messages.create({
      model: MODEL,
      max_tokens: 20,
      messages: [{ role: 'user', content: 'Reply with exactly one word: ready' }],
    });
    const text = msg.content.map((b) => (b.type === 'text' ? b.text : '')).join('').trim();
    return {
      status: 'pass',
      detail: `${MODEL} replied "${short(text, 60)}" (${msg.usage.input_tokens} in / ${msg.usage.output_tokens} out)`,
    };
  },

  async arize() {
    if (!env.ARIZE_SPACE_ID || !env.ARIZE_API_KEY) return { status: 'skip', detail: 'ARIZE_SPACE_ID / ARIZE_API_KEY not set' };
    if (!env.ANTHROPIC_API_KEY) return { status: 'skip', detail: 'needs ANTHROPIC_API_KEY to generate a trace' };

    // 1) Do the credentials get rejected? An empty OTLP export request is harmless.
    const probe = await fetch(ARIZE_OTLP_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-protobuf',
        'arize-space-id': env.ARIZE_SPACE_ID,
        'arize-api-key': env.ARIZE_API_KEY,
      },
      body: new Uint8Array(0),
      signal: AbortSignal.timeout(20_000),
    });
    if (probe.status === 401 || probe.status === 403) {
      throw new Error(`Arize rejected the credentials (HTTP ${probe.status}). Check ARIZE_SPACE_ID and ARIZE_API_KEY.`);
    }

    // 2) Send one real trace: a CHAIN span wrapping an auto-traced Anthropic call.
    const exportErrors: string[] = [];
    diag.setLogger(
      { error: (m) => exportErrors.push(m), warn: () => {}, info: () => {}, debug: () => {}, verbose: () => {} },
      DiagLogLevel.ERROR,
    );
    initTracing();
    const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }); // created AFTER initTracing
    await traced('smoke.chain', 'CHAIN', { 'input.value': 'smoke test' }, async () => {
      await client.messages.create({
        model: MODEL,
        max_tokens: 20,
        messages: [{ role: 'user', content: 'Reply with exactly one word: traced' }],
      });
    });
    await flushTracing();
    await shutdownTracing();
    if (exportErrors.length) throw new Error(`trace export errors: ${short(exportErrors)}`);
    return {
      status: 'pass',
      detail: `credentials accepted (probe HTTP ${probe.status}); trace "smoke.chain" sent. Confirm it appears in AX project "${env.ARIZE_PROJECT_NAME}" (can take a minute).`,
    };
  },

  async daytona() {
    if (!env.DAYTONA_API_KEY) return { status: 'skip', detail: 'DAYTONA_API_KEY not set' };
    const sandbox = await getDaytona().create({ language: 'typescript' });
    try {
      const run = await sandbox.process.executeCommand('echo hello-from-daytona');
      if (run.exitCode !== 0 || !run.result.includes('hello-from-daytona')) {
        throw new Error(`unexpected command result (exit ${run.exitCode}): ${short(run.result)}`);
      }
      return { status: 'pass', detail: `sandbox created, command ran ("${run.result.trim()}"), cleaned up` };
    } finally {
      await sandbox.delete().catch(() => undefined);
    }
  },

  async memory() {
    if (!env.AGENT_MEMORY_ENDPOINT || !env.AGENT_MEMORY_CONTEXT || !env.AGENT_MEMORY_API_KEY) {
      return { status: 'skip', detail: 'AGENT_MEMORY_ENDPOINT / _CONTEXT / _API_KEY not set' };
    }
    const wrote = await remember('Smoke test: tenant-advocate connectivity check.');
    if (!wrote.ok) throw new Error(`write (POST /facts) failed with HTTP ${wrote.status}: ${short(wrote.body)}`);
    const read = await recall('What was the connectivity check?');
    if (!read.ok) throw new Error(`recall (POST /query) failed with HTTP ${read.status}: ${short(read.body)}`);
    return { status: 'pass', detail: `write HTTP ${wrote.status}, recall HTTP ${read.status}` };
  },
};

async function main() {
  const requested = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const unknown = requested.filter((n) => !(n in checks));
  if (unknown.length) {
    console.error(`Unknown check(s): ${unknown.join(', ')}. Available: ${Object.keys(checks).join(', ')}`);
    process.exit(2);
  }
  const names = requested.length ? requested : Object.keys(checks);

  let failed = 0;
  for (const name of names) {
    const started = Date.now();
    try {
      const out = await checks[name]!();
      const icon = out.status === 'pass' ? 'PASS' : 'SKIP';
      console.log(`${icon}  ${name.padEnd(8)} ${out.detail}  (${Date.now() - started} ms)`);
    } catch (err) {
      failed++;
      // Node's fetch reports network problems as a bare "fetch failed"; the real reason is in `cause`.
      const cause = (err as { cause?: { message?: string; code?: string } }).cause;
      const why = cause ? ` (${cause.code ?? cause.message})` : '';
      console.log(`FAIL  ${name.padEnd(8)} ${(err as Error).message}${why}  (${Date.now() - started} ms)`);
    }
  }
  console.log(failed ? `\n${failed} check(s) failed.` : '\nNo failures. (SKIP means credentials are not set yet.)');
  process.exit(failed ? 1 : 0);
}

void main();
