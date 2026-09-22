import { Injectable, type OnModuleInit } from '@galaxy-stack/orbit-core';
import { MetricsRegistry } from './registry';
import { getMetricMetadata, markAsMetricsProvider } from '../decorators/metric.decorators';

@Injectable()
export abstract class MetricsProvider implements OnModuleInit {
  protected __metricsRegistry: MetricsRegistry;

  constructor(protected readonly registry: MetricsRegistry) {
    this.__metricsRegistry = registry;
    markAsMetricsProvider(this.constructor);
  }

  onModuleInit(): void {
    this.initializeMetrics();
  }

  private initializeMetrics(): void {
    const metadata = getMetricMetadata(this.constructor);
    
    for (const { type, propertyKey, options } of metadata) {
      switch (type) {
        case 'counter':
          (this as any)[propertyKey] = this.registry.createCounter(options);
          break;
        case 'gauge':
          (this as any)[propertyKey] = this.registry.createGauge(options);
          break;
        case 'histogram':
          (this as any)[propertyKey] = this.registry.createHistogram(options as any);
          break;
      }
    }
  }
}
