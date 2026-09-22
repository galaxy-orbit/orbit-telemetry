import type { SpanExporter, ReadonlySpan, SpanEvent } from '../trace.interface';
import { SpanKind, SpanStatusCode } from '../trace.interface';

export interface OTLPExporterOptions {
  endpoint: string;
  headers?: Record<string, string>;
  timeout?: number;
  compression?: 'none' | 'gzip';
  serviceName: string;
  serviceVersion?: string;
}

interface OTLPSpan {
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  name: string;
  kind: number;
  startTimeUnixNano: string;
  endTimeUnixNano: string;
  attributes: OTLPAttribute[];
  events: OTLPEvent[];
  status: { code: number; message?: string };
}

interface OTLPAttribute {
  key: string;
  value: { stringValue?: string; intValue?: string; boolValue?: boolean };
}

interface OTLPEvent {
  timeUnixNano: string;
  name: string;
  attributes: OTLPAttribute[];
}

export class OTLPExporter implements SpanExporter {
  private endpoint: string;
  private headers: Record<string, string>;
  private timeout: number;
  private serviceName: string;
  private serviceVersion: string;

  constructor(options: OTLPExporterOptions) {
    this.endpoint = options.endpoint.replace(/\/$/, '') + '/v1/traces';
    this.headers = {
      'Content-Type': 'application/json',
      ...options.headers,
    };
    this.timeout = options.timeout ?? 10000;
    this.serviceName = options.serviceName;
    this.serviceVersion = options.serviceVersion ?? '0.0.0';
  }

  async export(spans: ReadonlySpan[]): Promise<void> {
    if (spans.length === 0) return;

    const payload = this.buildPayload(spans);
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: this.headers,
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`OTLP export failed: ${response.status} ${response.statusText}`);
      }
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private buildPayload(spans: ReadonlySpan[]): any {
    const otlpSpans = spans.map(span => this.convertSpan(span));

    return {
      resourceSpans: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: this.serviceName } },
              { key: 'service.version', value: { stringValue: this.serviceVersion } },
              { key: 'telemetry.sdk.name', value: { stringValue: 'orbit' } },
              { key: 'telemetry.sdk.language', value: { stringValue: 'javascript' } },
            ],
          },
          scopeSpans: [
            {
              scope: {
                name: '@galaxy-stack/orbit-telemetry',
                version: '1.0.0',
              },
              spans: otlpSpans,
            },
          ],
        },
      ],
    };
  }

  private convertSpan(span: ReadonlySpan): OTLPSpan {
    const startNano = this.msToNano(span.startTime);
    const endNano = this.msToNano(span.endTime);

    return {
      traceId: span.spanContext.traceId,
      spanId: span.spanContext.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: this.convertKind(span.kind),
      startTimeUnixNano: startNano,
      endTimeUnixNano: endNano,
      attributes: this.convertAttributes(span.attributes),
      events: this.convertEvents(span.events),
      status: {
        code: this.convertStatusCode(span.status.code),
        message: span.status.message,
      },
    };
  }

  private msToNano(ms: number): string {
    const now = Date.now();
    const epochMs = now - performance.now() + ms;
    return (BigInt(Math.floor(epochMs)) * BigInt(1000000)).toString();
  }

  private convertKind(kind: SpanKind): number {
    const mapping: Record<SpanKind, number> = {
      [SpanKind.INTERNAL]: 1,
      [SpanKind.SERVER]: 2,
      [SpanKind.CLIENT]: 3,
      [SpanKind.PRODUCER]: 4,
      [SpanKind.CONSUMER]: 5,
    };
    return mapping[kind] ?? 1;
  }

  private convertStatusCode(code: SpanStatusCode): number {
    const mapping: Record<SpanStatusCode, number> = {
      [SpanStatusCode.UNSET]: 0,
      [SpanStatusCode.OK]: 1,
      [SpanStatusCode.ERROR]: 2,
    };
    return mapping[code] ?? 0;
  }

  private convertAttributes(attrs: Record<string, string | number | boolean>): OTLPAttribute[] {
    return Object.entries(attrs).map(([key, value]) => ({
      key,
      value: this.convertValue(value),
    }));
  }

  private convertValue(value: string | number | boolean): OTLPAttribute['value'] {
    if (typeof value === 'string') {
      return { stringValue: value };
    }
    if (typeof value === 'number') {
      return { intValue: String(value) };
    }
    if (typeof value === 'boolean') {
      return { boolValue: value };
    }
    return { stringValue: String(value) };
  }

  private convertEvents(events: SpanEvent[]): OTLPEvent[] {
    return events.map(event => ({
      timeUnixNano: this.msToNano(event.timestamp),
      name: event.name,
      attributes: event.attributes ? this.convertAttributes(event.attributes) : [],
    }));
  }

  async shutdown(): Promise<void> {
  }
}
