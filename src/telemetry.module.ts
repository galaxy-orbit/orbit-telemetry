import { Module, Injectable } from '@galaxy-stack/orbit-core';
import type { DynamicModule, Provider, OnModuleInit, OnModuleDestroy } from '@galaxy-stack/orbit-core';
import { MetricsRegistry } from './metrics/registry';
import { DefaultCollectors } from './collectors/default.collectors';
import { MetricsMiddleware, type MetricsMiddlewareOptions } from './middleware/metrics.middleware';
import { METRICS_REGISTRY, METRICS_OPTIONS } from './metrics/metric.interface';

export interface MetricsModuleOptions {
  path?: string;
  defaultLabels?: Record<string, string>;
  collectDefaultMetrics?: boolean;
  collectInterval?: number;
  middleware?: MetricsMiddlewareOptions;
  isGlobal?: boolean;
}

export const METRICS_PATH = Symbol('METRICS_PATH');

export { METRICS_OPTIONS };

@Injectable()
class MetricsLifecycle implements OnModuleInit, OnModuleDestroy {
  constructor(
    private readonly registry: MetricsRegistry,
    private readonly defaultCollectors: DefaultCollectors,
    private readonly options: MetricsModuleOptions
  ) {}

  onModuleInit(): void {
    if (this.options.defaultLabels) {
      this.registry.setDefaultLabels(this.options.defaultLabels);
    }

    if (this.options.collectDefaultMetrics !== false) {
      this.defaultCollectors.startCollecting(this.options.collectInterval);
    }
  }

  onModuleDestroy(): void {
    this.defaultCollectors.stopCollecting();
  }
}

@Module({})
export class MetricsModule {
  static forRoot(options: MetricsModuleOptions = {}): DynamicModule {
    const providers: Provider[] = [
      {
        provide: METRICS_OPTIONS,
        useValue: options,
      },
      {
        provide: METRICS_PATH,
        useValue: options.path || '/metrics',
      },
      MetricsRegistry,
      {
        provide: METRICS_REGISTRY,
        useExisting: MetricsRegistry,
      },
      DefaultCollectors,
      MetricsMiddleware,
      {
        provide: MetricsLifecycle,
        useFactory: (registry: MetricsRegistry, collectors: DefaultCollectors) => {
          return new MetricsLifecycle(registry, collectors, options);
        },
        inject: [MetricsRegistry, DefaultCollectors],
      },
    ];

    return {
      module: MetricsModule,
      global: options.isGlobal ?? true,
      providers,
      exports: [
        MetricsRegistry, 
        METRICS_REGISTRY, 
        MetricsMiddleware, 
        METRICS_PATH,
      ],
    };
  }
}
