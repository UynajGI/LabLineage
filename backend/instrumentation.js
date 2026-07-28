import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { NodeSDK } from '@opentelemetry/sdk-node';

const endpoint = process.env.OTEL_EXPORTER_OTLP_TRACES_ENDPOINT;

if (endpoint) {
  process.env.OTEL_SERVICE_NAME ||= 'lablineage-guardian-api';
  const sdk = new NodeSDK({
    traceExporter: new OTLPTraceExporter({
      url: endpoint,
      ...(process.env.OTEL_EXPORTER_OTLP_HEADERS
        ? { headers: Object.fromEntries(
          process.env.OTEL_EXPORTER_OTLP_HEADERS
            .split(',')
            .map((pair) => pair.split('=', 2).map((part) => part.trim()))
            .filter(([key, value]) => key && value)
        ) }
        : {})
    }),
    instrumentations: [getNodeAutoInstrumentations({
      '@opentelemetry/instrumentation-fs': { enabled: false }
    })]
  });
  sdk.start();
  globalThis.__lablineageTelemetry = sdk;
}
