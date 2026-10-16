import Anthropic from '@anthropic-ai/sdk';
import { AnthropicInstrumentation } from '@arizeai/openinference-instrumentation-anthropic';
import {
  OpenInferenceSpanKind,
  SEMRESATTRS_PROJECT_NAME,
  SemanticConventions,
} from '@arizeai/openinference-semantic-conventions';
import { SpanStatusCode, trace, type Attributes } from '@opentelemetry/api';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { registerInstrumentations } from '@opentelemetry/instrumentation';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { BatchSpanProcessor, NodeTracerProvider } from '@opentelemetry/sdk-trace-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { env } from '../config.js';
import { logger } from '../logger.js';

export const ARIZE_OTLP_URL = 'https://otlp.arize.com/v1/traces';

let provider: NodeTracerProvider | undefined;

/**
 * Starts OpenTelemetry export to Arize AX and auto-traces every Anthropic call.
 * Must run BEFORE the first Anthropic client is created. Returns false (and does nothing)
 * when Arize credentials are not configured, so the app still runs without them.
 */
export function initTracing(): boolean {
  if (provider) return true;
  if (!env.ARIZE_SPACE_ID || !env.ARIZE_API_KEY) {
    logger.warn('Arize credentials not set; tracing disabled');
    return false;
  }

  provider = new NodeTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: 'tenant-advocate-server',
      [SEMRESATTRS_PROJECT_NAME]: env.ARIZE_PROJECT_NAME,
    }),
    spanProcessors: [
      new BatchSpanProcessor(
        new OTLPTraceExporter({
          url: ARIZE_OTLP_URL,
          headers: { 'arize-space-id': env.ARIZE_SPACE_ID, 'arize-api-key': env.ARIZE_API_KEY },
        }),
      ),
    ],
  });
  provider.register();

  // ESM can't be auto-patched on import, so patch the Anthropic class explicitly.
  const instrumentation = new AnthropicInstrumentation();
  instrumentation.manuallyInstrument(Anthropic);
  registerInstrumentations({ instrumentations: [instrumentation] });

  logger.info({ project: env.ARIZE_PROJECT_NAME }, 'Arize tracing enabled');
  return true;
}

export async function flushTracing(): Promise<void> {
  await provider?.forceFlush();
}

export async function shutdownTracing(): Promise<void> {
  await provider?.shutdown();
  provider = undefined;
}

type SpanKind = 'CHAIN' | 'TOOL' | 'AGENT' | 'RETRIEVER' | 'EVALUATOR' | 'GUARDRAIL';

/**
 * Wraps a unit of work in a span Arize understands. Anthropic calls are traced automatically;
 * use this for the orchestrator loop (CHAIN/AGENT) and for each tool or validator it runs,
 * because the auto-instrumentation can't see our own code.
 */
export async function traced<T>(
  name: string,
  kind: SpanKind,
  attributes: Attributes,
  fn: () => Promise<T>,
): Promise<T> {
  const tracer = trace.getTracer('tenant-advocate');
  return tracer.startActiveSpan(
    name,
    { attributes: { [SemanticConventions.OPENINFERENCE_SPAN_KIND]: OpenInferenceSpanKind[kind], ...attributes } },
    async (span) => {
      try {
        return await fn();
      } catch (err) {
        span.recordException(err as Error);
        span.setStatus({ code: SpanStatusCode.ERROR, message: (err as Error).message });
        throw err;
      } finally {
        span.end();
      }
    },
  );
}
