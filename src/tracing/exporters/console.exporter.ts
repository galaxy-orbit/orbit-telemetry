import type { SpanExporter, ReadonlySpan } from '../trace.interface';
import { SpanKind, SpanStatusCode } from '../trace.interface';

export interface ConsoleExporterOptions {
  prettyPrint?: boolean;
  logLevel?: 'debug' | 'info' | 'log';
}

export class ConsoleExporter implements SpanExporter {
  private prettyPrint: boolean;
  private logLevel: 'debug' | 'info' | 'log';

  constructor(options: ConsoleExporterOptions = {}) {
    this.prettyPrint = options.prettyPrint ?? true;
    this.logLevel = options.logLevel ?? 'log';
  }

  async export(spans: ReadonlySpan[]): Promise<void> {
    for (const span of spans) {
      if (this.prettyPrint) {
        this.printPretty(span);
      } else {
        this.printJson(span);
      }
    }
  }

  private printPretty(span: ReadonlySpan): void {
    const kindName = SpanKind[span.kind] || 'UNKNOWN';
    const statusName = SpanStatusCode[span.status.code] || 'UNKNOWN';
    const durationMs = span.duration.toFixed(2);
    
    const parts = [
      `[TRACE]`,
      `${span.name}`,
      `(${kindName})`,
      `${durationMs}ms`,
      `[${statusName}]`,
    ];
    
    if (span.parentSpanId) {
      parts.push(`parent:${span.parentSpanId.slice(0, 8)}`);
    }
    
    const message = parts.join(' ');
    const details: Record<string, any> = {
      traceId: span.spanContext.traceId,
      spanId: span.spanContext.spanId,
    };
    
    if (Object.keys(span.attributes).length > 0) {
      details.attributes = span.attributes;
    }
    
    if (span.events.length > 0) {
      details.events = span.events.map(e => e.name);
    }
    
    console[this.logLevel](message, details);
  }

  private printJson(span: ReadonlySpan): void {
    const output = {
      traceId: span.spanContext.traceId,
      spanId: span.spanContext.spanId,
      parentSpanId: span.parentSpanId,
      name: span.name,
      kind: SpanKind[span.kind],
      startTime: span.startTime,
      endTime: span.endTime,
      duration: span.duration,
      status: {
        code: SpanStatusCode[span.status.code],
        message: span.status.message,
      },
      attributes: span.attributes,
      events: span.events,
    };
    
    console[this.logLevel](JSON.stringify(output));
  }

  async shutdown(): Promise<void> {
  }
}
