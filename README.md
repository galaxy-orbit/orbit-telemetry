# @galaxy-stack/orbit-telemetry

[![npm version](https://img.shields.io/npm/v/@galaxy-stack/orbit-telemetry.svg)](https://www.npmjs.com/package/@galaxy-stack/orbit-telemetry)
[![docs](https://img.shields.io/badge/docs-galaxy--orbit--framework.vercel.app-blue)](https://galaxy-orbit-framework.vercel.app)

Part of the [Orbit framework](https://github.com/galaxy-orbit/packages) — a NestJS-style backend framework for [Bun](https://bun.sh).

## Installation

```bash
bun add @galaxy-stack/orbit-telemetry
```

# @galaxy-stack/orbit-telemetry

Telemetry and observability module for Orbit - Prometheus-compatible metrics, distributed tracing with OpenTelemetry support, and request monitoring.

## Installation

```bash
bun add @galaxy-stack/orbit-telemetry
```

## Features

### Metrics
- Prometheus-compatible metrics format
- Counter, Gauge, and Histogram metric types
- Default process metrics (memory, uptime, event loop lag)
- HTTP request metrics middleware
- Method decorators for automatic timing and counting
- MetricsProvider base class for decorator-based metrics

### Tracing
- OpenTelemetry-compatible distributed tracing
- W3C Trace Context propagation
- Span and Tracer APIs
- @Trace() method decorator
- Multiple exporters: Console, OTLP
- Sampling strategies: AlwaysOn, AlwaysOff, Probability, RateLimiting

## Quick Start

### Metrics Setup

```typescript
import { Module } from '@galaxy-stack/orbit-core';
import { MetricsModule } from '@galaxy-stack/orbit-telemetry';

@Module({
  imports: [
    MetricsModule.forRoot({
      path: '/metrics',
      collectDefaultMetrics: true,
      defaultLabels: {
        app: 'my-service',
        env: 'production',
      },
    }),
  ],
})
export class AppModule {}
```

### Tracing Setup

```typescript
import { Module } from '@galaxy-stack/orbit-core';
import { TracingModule, ConsoleExporter, OTLPExporter } from '@galaxy-stack/orbit-telemetry';

@Module({
  imports: [
    TracingModule.forRoot({
      serviceName: 'my-service',
      serviceVersion: '1.0.0',
      exporter: new ConsoleExporter({ prettyPrint: true }),
      // Or use OTLP for production:
      // exporter: new OTLPExporter({
      //   endpoint: 'http://localhost:4318',
      //   serviceName: 'my-service',
      // }),
    }),
  ],
})
export class AppModule {}
```

### Using Tracer

```typescript
import { Injectable } from '@galaxy-stack/orbit-core';
import { Tracer, SpanKind, SpanStatusCode } from '@galaxy-stack/orbit-telemetry';

@Injectable()
export class OrderService {
  constructor(private readonly tracer: Tracer) {}

  async processOrder(orderId: string) {
    return this.tracer.startActiveSpan('processOrder', {
      kind: SpanKind.INTERNAL,
      attributes: { 'order.id': orderId },
    }, async (span) => {
      try {
        await this.validateOrder(orderId);
        await this.chargePayment(orderId);
        await this.shipOrder(orderId);
        
        span.setStatus({ code: SpanStatusCode.OK });
        return { success: true };
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message,
        });
        throw error;
      }
    });
  }

  private async validateOrder(orderId: string) {
    return this.tracer.startActiveSpan('validateOrder', async (span) => {
      span.setAttribute('order.id', orderId);
      // Validation logic
      span.addEvent('validation_complete');
    });
  }
}
```

### Using @Trace() Decorator

```typescript
import { Injectable } from '@galaxy-stack/orbit-core';
import { TracingProvider, Tracer, Trace, SpanKind } from '@galaxy-stack/orbit-telemetry';

@Injectable()
export class PaymentService extends TracingProvider {
  constructor(tracer: Tracer) {
    super(tracer);
  }

  @Trace({ kind: SpanKind.CLIENT })
  async chargeCard(amount: number) {
    // This method is automatically traced
    return await this.gateway.charge(amount);
  }

  @Trace({ name: 'payment.refund' })
  async refund(transactionId: string) {
    return await this.gateway.refund(transactionId);
  }
}
```

## Distributed Tracing

### Context Propagation

Context is automatically propagated via W3C Trace Context headers:

```typescript
import { extractContext, injectContext } from '@galaxy-stack/orbit-telemetry';

// Extract context from incoming request
const parentContext = extractContext(request.headers);

// Inject context into outgoing request
const headers = new Headers();
injectContext(span.spanContext, headers);
await fetch('http://other-service/api', { headers });
```

### TracingMiddleware

Automatically trace all HTTP requests:

```typescript
import { TracingMiddleware } from '@galaxy-stack/orbit-telemetry';

// Applied via module configuration
// Traces: http.method, http.url, http.status_code, etc.
```

## Exporters

### Console Exporter

```typescript
import { ConsoleExporter } from '@galaxy-stack/orbit-telemetry';

const exporter = new ConsoleExporter({
  prettyPrint: true,  // Human-readable format
  logLevel: 'info',   // 'debug' | 'info' | 'log'
});
```

### OTLP Exporter

Export to OpenTelemetry Collector, Jaeger, or any OTLP-compatible backend:

```typescript
import { OTLPExporter } from '@galaxy-stack/orbit-telemetry';

const exporter = new OTLPExporter({
  endpoint: 'http://localhost:4318',
  serviceName: 'my-service',
  serviceVersion: '1.0.0',
  headers: {
    'Authorization': 'Bearer token',
  },
  timeout: 10000,
});
```

## Samplers

Control which traces are recorded:

```typescript
import {
  AlwaysOnSampler,
  AlwaysOffSampler,
  ProbabilitySampler,
  RateLimitingSampler,
  ParentBasedSampler,
} from '@galaxy-stack/orbit-telemetry';

// Sample 10% of traces
const sampler = new ProbabilitySampler(0.1);

// Max 100 traces per second
const rateSampler = new RateLimitingSampler(100);

// Always sample if parent was sampled
const parentSampler = new ParentBasedSampler(new ProbabilitySampler(0.5));
```

## Metrics API

### Counter

```typescript
const counter = registry.createCounter({
  name: 'http_requests_total',
  help: 'Total HTTP requests',
  labelNames: ['method', 'status'],
});

counter.inc();
counter.inc({ method: 'GET', status: '200' }, 5);
```

### Gauge

```typescript
const gauge = registry.createGauge({
  name: 'active_connections',
  help: 'Number of active connections',
});

gauge.set(42);
gauge.inc();
gauge.dec();
```

### Histogram

```typescript
const histogram = registry.createHistogram({
  name: 'request_duration_seconds',
  help: 'Request duration',
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5],
});

histogram.observe(0.234);

// Timer helper
const timer = histogram.startTimer();
await doWork();
timer();
```

## Default Metrics

When `collectDefaultMetrics: true`:

| Metric | Type | Description |
|--------|------|-------------|
| `process_start_time_seconds` | Gauge | Process start time |
| `process_uptime_seconds` | Gauge | Process uptime |
| `process_resident_memory_bytes` | Gauge | Memory RSS |
| `nodejs_heap_size_used_bytes` | Gauge | Heap used |
| `nodejs_heap_size_total_bytes` | Gauge | Heap total |
| `nodejs_eventloop_lag_seconds` | Gauge | Event loop lag |
| `bun_version_info` | Gauge | Bun version |

## Module Options

### MetricsModuleOptions

```typescript
interface MetricsModuleOptions {
  path?: string;                    // Default: '/metrics'
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;  // Default: true
  collectInterval?: number;         // Default: 10000ms
  isGlobal?: boolean;               // Default: true
}
```

### TracingModuleOptions

```typescript
interface TracingModuleOptions {
  serviceName: string;
  serviceVersion?: string;
  exporter?: SpanExporter;
  sampler?: Sampler;
  batchSize?: number;       // Default: 100
  flushInterval?: number;   // Default: 5000ms
  isGlobal?: boolean;       // Default: true
}
```

## Integration Example

Full observability setup:

```typescript
import { Module } from '@galaxy-stack/orbit-core';
import { 
  MetricsModule, 
  TracingModule, 
  OTLPExporter,
  ProbabilitySampler,
} from '@galaxy-stack/orbit-telemetry';

@Module({
  imports: [
    MetricsModule.forRoot({
      path: '/metrics',
      collectDefaultMetrics: true,
      defaultLabels: {
        service: 'order-service',
        env: process.env.NODE_ENV,
      },
    }),
    TracingModule.forRoot({
      serviceName: 'order-service',
      serviceVersion: '1.0.0',
      exporter: new OTLPExporter({
        endpoint: process.env.OTLP_ENDPOINT || 'http://localhost:4318',
        serviceName: 'order-service',
      }),
      sampler: new ProbabilitySampler(0.1),
    }),
  ],
})
export class AppModule {}
```
