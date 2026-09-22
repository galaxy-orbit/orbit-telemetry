import { Injectable } from '@galaxy-stack/orbit-core';
import { 
  type ITracer, 
  type ISpan, 
  type SpanOptions, 
  type SpanExporter,
  type ReadonlySpan,
  type Sampler,
  type SpanContext,
} from './trace.interface';
import { Span } from './span';
import { ContextManager } from './context';

@Injectable()
export class Tracer implements ITracer {
  readonly name: string;
  readonly version?: string;
  
  private exporter?: SpanExporter;
  private sampler?: Sampler;
  private contextManager: ContextManager;
  private pendingSpans: ReadonlySpan[] = [];
  private batchSize = 100;
  private flushInterval = 5000;
  private flushTimer?: Timer;

  constructor(options: {
    name: string;
    version?: string;
    exporter?: SpanExporter;
    sampler?: Sampler;
    batchSize?: number;
    flushInterval?: number;
  }) {
    this.name = options.name;
    this.version = options.version;
    this.exporter = options.exporter;
    this.sampler = options.sampler;
    this.contextManager = new ContextManager();
    
    if (options.batchSize) this.batchSize = options.batchSize;
    if (options.flushInterval) this.flushInterval = options.flushInterval;
    
    if (this.exporter) {
      this.startFlushTimer();
    }
  }

  private startFlushTimer(): void {
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
  }

  startSpan(name: string, options: SpanOptions = {}): ISpan {
    let parentContext: SpanContext | undefined = options.parent;
    
    if (!parentContext) {
      const parentSpan = this.contextManager.getCurrentSpan();
      if (parentSpan) {
        parentContext = parentSpan.spanContext;
      }
    }
    
    if (parentContext && !(parentContext.traceFlags & 1)) {
      return new NoopSpan(name);
    }
    
    if (this.sampler) {
      const contextForSampling = parentContext || { traceId: '', spanId: '', traceFlags: 1 };
      const shouldSample = this.sampler.shouldSample(contextForSampling, name);
      if (!shouldSample) {
        return new NoopSpan(name);
      }
    }
    
    const spanOptions: SpanOptions & { onEnd: (span: ReadonlySpan) => void } = {
      ...options,
      parent: parentContext,
      onEnd: (span: ReadonlySpan) => this.onSpanEnd(span),
    };
    
    return new Span(name, spanOptions);
  }

  startActiveSpan<T>(
    name: string,
    optionsOrFn: SpanOptions | ((span: ISpan) => T),
    fn?: (span: ISpan) => T
  ): T {
    let options: SpanOptions = {};
    let callback: (span: ISpan) => T;
    
    if (typeof optionsOrFn === 'function') {
      callback = optionsOrFn;
    } else {
      options = optionsOrFn;
      callback = fn!;
    }
    
    const span = this.startSpan(name, options);
    
    return this.contextManager.with(span, () => {
      try {
        const result = callback(span);
        
        if (result instanceof Promise) {
          return result.finally(() => span.end()) as unknown as T;
        }
        
        span.end();
        return result;
      } catch (error) {
        span.setStatus({
          code: 2,
          message: error instanceof Error ? error.message : String(error),
        });
        span.end();
        throw error;
      }
    });
  }

  private onSpanEnd(span: ReadonlySpan): void {
    if (!this.exporter) return;
    
    this.pendingSpans.push(span);
    
    if (this.pendingSpans.length >= this.batchSize) {
      this.flush();
    }
  }

  async flush(): Promise<void> {
    if (!this.exporter || this.pendingSpans.length === 0) return;
    
    const spans = [...this.pendingSpans];
    this.pendingSpans = [];
    
    try {
      await this.exporter.export(spans);
    } catch (error) {
      console.error('[Tracer] Failed to export spans:', error);
      this.pendingSpans.unshift(...spans);
    }
  }

  async shutdown(): Promise<void> {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
    }
    
    await this.flush();
    
    if (this.exporter) {
      await this.exporter.shutdown();
    }
  }

  getContextManager(): ContextManager {
    return this.contextManager;
  }
}

class NoopSpan implements ISpan {
  readonly spanContext = { traceId: '', spanId: '', traceFlags: 0 };
  readonly name: string;
  readonly kind = 0;
  readonly startTime = 0;
  
  constructor(name: string) {
    this.name = name;
  }
  
  setAttribute(): ISpan { return this; }
  setAttributes(): ISpan { return this; }
  addEvent(): ISpan { return this; }
  setStatus(): ISpan { return this; }
  updateName(): ISpan { return this; }
  end(): void {}
  isRecording(): boolean { return false; }
}
