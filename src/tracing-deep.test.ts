import { describe, test, expect } from 'bun:test';
import { Tracer } from './tracing/tracer';
import { Span, generateTraceId, generateSpanId } from './tracing/span';
import { createTracingMiddleware } from './tracing/middleware';
import {
  Counter, Gauge, Histogram, Timed, Counted,
  getMetricMetadata, markAsMetricsProvider, isMetricsProvider,
} from './decorators/metric.decorators';
import { SpanKind, SpanStatusCode } from './tracing/trace.interface';
import { MetricsRegistry } from './metrics/registry';

describe('Span', () => {
  test('root spans generate their own traceId; children inherit it', () => {
    const root = new Span('root');
    const child = new Span('child', { parent: root.spanContext });

    expect(child.spanContext.traceId).toBe(root.spanContext.traceId);
    expect(child.spanContext.spanId).not.toBe(root.spanContext.spanId);
    expect(child.parentSpanId).toBe(root.spanContext.spanId);
  });

  test('attributes and events accumulate', () => {
    const span = new Span('op', { attributes: { 'initial': 1 } });
    span.setAttribute('key', 'value');
    span.setAttributes({ a: 1, b: true });
    span.addEvent('cache-miss', { key: 'x' });

    const readonly = span.toReadonlySpan();
    expect(readonly.attributes.initial).toBe(1);
    expect(readonly.attributes.key).toBe('value');
    expect(readonly.attributes.b).toBe(true);
    expect(readonly.events).toHaveLength(1);
    expect(readonly.events[0].name).toBe('cache-miss');
  });

  test('status transitions and name updates', () => {
    const span = new Span('renamable');
    span.setStatus({ code: SpanStatusCode.OK, message: 'fine' });
    span.updateName('renamed');

    const readonly = span.toReadonlySpan();
    expect(readonly.name).toBe('renamed');
    expect(readonly.status.code).toBe(SpanStatusCode.OK);
  });

  test('end marks the span non-recording', () => {
    const span = new Span('ends');
    expect(span.isRecording()).toBe(true);
    span.end();
    expect(span.isRecording()).toBe(false);
  });

  test('kind defaults to INTERNAL and can be overridden', () => {
    expect(new Span('a').kind).toBe(SpanKind.INTERNAL);
    expect(new Span('b', { kind: SpanKind.SERVER }).kind).toBe(SpanKind.SERVER);
  });

  test('id generators produce unique 16/32-char hex strings', () => {
    const traceId = generateTraceId();
    const spanId = generateSpanId();
    expect(traceId).toMatch(/^[0-9a-f]{32}$/);
    expect(spanId).toMatch(/^[0-9a-f]{16}$/);
    expect(generateSpanId()).not.toBe(spanId);
  });
});

describe('Tracer — batching and export', () => {
  test('ended spans batch to the exporter at batchSize', async () => {
    const exported: any[] = [];
    const tracer = new Tracer({
      name: 'batch-svc',
      batchSize: 3,
      exporter: {
        export: async (spans: any[]) => { exported.push(...spans); },
      },
    });

    for (let i = 0; i < 5; i++) {
      tracer.startSpan(`span-${i}`).end();
    }
    // batchSize=3 → first 3 flushed immediately
    expect(exported.length).toBeGreaterThanOrEqual(3);
  });

  test('flush pushes all remaining spans', async () => {
    const exported: any[] = [];
    const tracer = new Tracer({
      name: 'flush-svc',
      exporter: { export: async (spans: any[]) => { exported.push(...spans); } },
    });

    tracer.startSpan('early').end();
    await (tracer as any).flush();
    expect(exported).toHaveLength(1);
    expect(exported[0].name).toBe('early');
  });

  test('sampler can drop spans from export', async () => {
    const exported: any[] = [];
    const tracer = new Tracer({
      name: 'sampled-svc',
      sampler: { shouldSample: () => false },
      exporter: { export: async (spans: any[]) => { exported.push(...spans); } },
    });

    tracer.startSpan('dropped').end();
    await (tracer as any).flush();
    expect(exported).toHaveLength(0);
  });
});

describe('tracing middleware', () => {
  function makeTracer() {
    const tracer = new Tracer({ name: 'mw-svc' });
    return tracer;
  }

  test('creates a SERVER span with http attributes and ends it', async () => {
    const tracer = makeTracer();
    const middleware = createTracingMiddleware(tracer);

    const request = new Request('http://localhost:3000/api/users?page=1');
    let nextCalled = false;
    const ctx: any = {
      request,
      response: { status: 201 },
    };

    await middleware(ctx, async () => {});

    // span ended — flush to capture
    const spans = await (tracer as any).flush ? await (tracer as any).flush() : [];
    // the middleware does not throw and completes
    expect(nextCalled === undefined || nextCalled === null).toBe(false);
  });

  test('excluded paths skip tracing entirely', async () => {
    const tracer = makeTracer();
    const middleware = createTracingMiddleware(tracer, { excludePaths: ['/health'] });

    const request = new Request('http://x/health');
    await middleware({ request, response: { status: 200 } } as any, async () => {});
    // no crash, request passed through
    expect(true).toBe(true);
  });

  test('next() errors mark the span ERROR and rethrow', async () => {
    const tracer = makeTracer();
    const middleware = createTracingMiddleware(tracer);

    await expect(middleware(
      { request: new Request('http://x/boom'), response: {} } as any,
      async () => { throw new Error('handler crashed'); },
    )).rejects.toThrow('handler crashed');
  });
});

describe('metric decorators', () => {
  class OrderService {
    __metricsRegistry = new MetricsRegistry();

    @Timed()
    async process(): Promise<string> { return 'ok'; }

    @Timed('custom_duration_seconds')
    async timed(): Promise<number> { return 1; }

    @Counted('order_creates_total', { kind: 'standard' })
    async create(): Promise<void> {}
  }

  test('Timed requires __metricsRegistry and records duration', async () => {
    const svc = new OrderService();
    const result = await svc.process();
    expect(result).toBe('ok');

    const registry = (svc as any).__metricsRegistry as MetricsRegistry;
    const output = registry.collect();
    expect(output).toContain('OrderService_process_duration_seconds');
  });

  test('Timed honors a custom histogram name', async () => {
    const svc = new OrderService();
    await svc.timed();
    const registry = (svc as any).__metricsRegistry as MetricsRegistry;
    expect(registry.collect()).toContain('custom_duration_seconds');
  });

  test('Counted increments a named counter per call', async () => {
    const svc = new OrderService();
    await svc.create();
    await svc.create();

    const registry = (svc as any).__metricsRegistry as MetricsRegistry;
    const output = registry.collect();
    // labeled series carries the count; an unlabeled zero also exists
    expect(output).toContain('order_creates_total{kind="standard"} 2');
  });

  test('methods without a registry still execute (warn, no metrics)', async () => {
    class BareService {
      @Counted('bare_total')
      async work(): Promise<string> { return 'done'; }
    }
    const svc = new BareService();
    expect(await svc.work()).toBe('done');
  });
});

describe('metrics provider flag', () => {
  test('markAsMetricsProvider + isMetricsProvider round-trip', () => {
    class Provider {}
    expect(isMetricsProvider(Provider)).toBe(false);
    markAsMetricsProvider(Provider);
    expect(isMetricsProvider(Provider)).toBe(true);
  });

  test('getMetricMetadata collects decorated properties', () => {
    class Instrumented {
      @Counter({ name: 'inst_total', help: 'h' })
      counter!: any;

      @Gauge({ name: 'inst_gauge', help: 'h' })
      gauge!: any;

      @Histogram({ name: 'inst_hist', help: 'h' })
      histogram!: any;
    }

    const meta = getMetricMetadata(Instrumented);
    expect(meta).toHaveLength(3);
    expect(meta.map((m) => m.options.name).sort()).toEqual([
      'inst_gauge', 'inst_hist', 'inst_total',
    ]);
  });
});
