import { Injectable, Inject, Optional } from '@galaxy-stack/orbit-core';
import { MetricsRegistry } from '../metrics/registry';
import type { Histogram, Counter } from '../metrics/metric.interface';
import { METRICS_OPTIONS, type MetricsModuleOptions } from '../telemetry.module';

export interface MetricsMiddlewareOptions {
  path?: string;
  excludePaths?: string[];
  customLabels?: (req: Request) => Record<string, string>;
  buckets?: number[];
}

@Injectable()
export class MetricsMiddleware {
  private requestDuration: Histogram;
  private requestTotal: Counter;
  private readonly options: MetricsMiddlewareOptions;

  constructor(
    private readonly registry: MetricsRegistry,
    @Optional() @Inject(METRICS_OPTIONS) moduleOptions?: MetricsModuleOptions
  ) {
    this.options = moduleOptions?.middleware || {};
    
    this.requestDuration = this.registry.createHistogram({
      name: 'http_request_duration_seconds',
      help: 'Duration of HTTP requests in seconds',
      labelNames: ['method', 'route', 'status_code'],
      buckets: this.options.buckets || [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
    });

    this.requestTotal = this.registry.createCounter({
      name: 'http_requests_total',
      help: 'Total number of HTTP requests',
      labelNames: ['method', 'route', 'status_code'],
    });
  }

  use(req: Request, res: Response, next: () => void | Promise<void>): void | Promise<void> {
    const url = new URL(req.url);
    const path = url.pathname;

    if (this.options.excludePaths?.some(p => path.startsWith(p))) {
      return next();
    }

    const startTime = performance.now();

    const originalNext = next;
    const wrappedNext = async () => {
      try {
        await originalNext();
      } finally {
        const duration = (performance.now() - startTime) / 1000;
        const statusCode = (res as any).statusCode || 200;
        
        const labels = {
          method: req.method,
          route: this.normalizePath(path),
          status_code: String(statusCode),
          ...(this.options.customLabels?.(req) || {}),
        };

        this.requestDuration.observe(labels, duration);
        this.requestTotal.inc(labels);
      }
    };

    return wrappedNext();
  }

  private normalizePath(path: string): string {
    return path
      .replace(/\/\d+/g, '/:id')
      .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid');
  }
}
