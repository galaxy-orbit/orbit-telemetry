import type { ISpan, SpanContext } from './trace.interface';

const W3C_TRACEPARENT_HEADER = 'traceparent';
const W3C_TRACESTATE_HEADER = 'tracestate';

export class ContextManager {
  private currentSpan: ISpan | undefined;
  private contextStack: ISpan[] = [];

  getCurrentSpan(): ISpan | undefined {
    return this.currentSpan;
  }

  with<T>(span: ISpan, fn: () => T): T {
    const previousSpan = this.currentSpan;
    this.contextStack.push(span);
    this.currentSpan = span;
    
    try {
      return fn();
    } finally {
      this.contextStack.pop();
      this.currentSpan = previousSpan;
    }
  }

  async withAsync<T>(span: ISpan, fn: () => Promise<T>): Promise<T> {
    const previousSpan = this.currentSpan;
    this.contextStack.push(span);
    this.currentSpan = span;
    
    try {
      return await fn();
    } finally {
      this.contextStack.pop();
      this.currentSpan = previousSpan;
    }
  }

  clear(): void {
    this.currentSpan = undefined;
    this.contextStack = [];
  }
}

export function parseTraceparent(header: string): SpanContext | null {
  const parts = header.split('-');
  
  if (parts.length < 4) return null;
  
  const [version, traceId, spanId, flags] = parts;
  
  if (version !== '00') return null;
  if (traceId.length !== 32) return null;
  if (spanId.length !== 16) return null;
  
  return {
    traceId,
    spanId,
    traceFlags: parseInt(flags, 16),
  };
}

export function formatTraceparent(context: SpanContext): string {
  const flags = context.traceFlags.toString(16).padStart(2, '0');
  return `00-${context.traceId}-${context.spanId}-${flags}`;
}

export function extractContext(headers: Headers | Record<string, string>): SpanContext | null {
  let traceparent: string | null = null;
  let tracestate: string | undefined;
  
  if (headers instanceof Headers) {
    traceparent = headers.get(W3C_TRACEPARENT_HEADER);
    tracestate = headers.get(W3C_TRACESTATE_HEADER) ?? undefined;
  } else {
    traceparent = headers[W3C_TRACEPARENT_HEADER] ?? headers['Traceparent'] ?? null;
    tracestate = headers[W3C_TRACESTATE_HEADER] ?? headers['Tracestate'];
  }
  
  if (!traceparent) return null;
  
  const context = parseTraceparent(traceparent);
  if (context && tracestate) {
    context.traceState = tracestate;
  }
  
  return context;
}

export function injectContext(context: SpanContext, headers: Headers | Record<string, string>): void {
  const traceparent = formatTraceparent(context);
  
  if (headers instanceof Headers) {
    headers.set(W3C_TRACEPARENT_HEADER, traceparent);
    if (context.traceState) {
      headers.set(W3C_TRACESTATE_HEADER, context.traceState);
    }
  } else {
    headers[W3C_TRACEPARENT_HEADER] = traceparent;
    if (context.traceState) {
      headers[W3C_TRACESTATE_HEADER] = context.traceState;
    }
  }
}

export { W3C_TRACEPARENT_HEADER, W3C_TRACESTATE_HEADER };
