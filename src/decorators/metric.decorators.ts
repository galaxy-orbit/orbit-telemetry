import 'reflect-metadata';
import type { CounterOptions, GaugeOptions, HistogramOptions } from '../metrics/metric.interface';

const METRIC_METADATA = Symbol('telemetry:metric');
const METRICS_PROVIDER_FLAG = Symbol('telemetry:is_metrics_provider');

export interface MetricMetadata {
  type: 'counter' | 'gauge' | 'histogram';
  propertyKey: string;
  options: CounterOptions | GaugeOptions | HistogramOptions;
}

export function Counter(options: CounterOptions): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const metadata: MetricMetadata[] = Reflect.getMetadata(METRIC_METADATA, target.constructor) || [];
    metadata.push({
      type: 'counter',
      propertyKey: String(propertyKey),
      options,
    });
    Reflect.defineMetadata(METRIC_METADATA, metadata, target.constructor);
  };
}

export function Gauge(options: GaugeOptions): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const metadata: MetricMetadata[] = Reflect.getMetadata(METRIC_METADATA, target.constructor) || [];
    metadata.push({
      type: 'gauge',
      propertyKey: String(propertyKey),
      options,
    });
    Reflect.defineMetadata(METRIC_METADATA, metadata, target.constructor);
  };
}

export function Histogram(options: HistogramOptions): PropertyDecorator {
  return (target: any, propertyKey: string | symbol) => {
    const metadata: MetricMetadata[] = Reflect.getMetadata(METRIC_METADATA, target.constructor) || [];
    metadata.push({
      type: 'histogram',
      propertyKey: String(propertyKey),
      options,
    });
    Reflect.defineMetadata(METRIC_METADATA, metadata, target.constructor);
  };
}

export function getMetricMetadata(target: any): MetricMetadata[] {
  return Reflect.getMetadata(METRIC_METADATA, target) || [];
}

export function markAsMetricsProvider(target: any): void {
  Reflect.defineMetadata(METRICS_PROVIDER_FLAG, true, target);
}

export function isMetricsProvider(target: any): boolean {
  return Reflect.getMetadata(METRICS_PROVIDER_FLAG, target) === true;
}

export function Timed(histogramName?: string): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const metricName = histogramName || `${target.constructor.name}_${String(propertyKey)}_duration_seconds`;
    
    descriptor.value = async function (...args: any[]) {
      const registry = (this as any).__metricsRegistry;
      
      if (!registry) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Telemetry] @Timed decorator on ${target.constructor.name}.${String(propertyKey)} ` +
            `requires extending MetricsProvider or manually setting __metricsRegistry. ` +
            `Metrics will not be recorded.`
          );
        }
        return originalMethod.apply(this, args);
      }
      
      const cacheKey = `__timed_${metricName}`;
      let histogram = (this as any)[cacheKey];
      
      if (!histogram) {
        histogram = registry.createHistogram({
          name: metricName,
          help: `Duration of ${String(propertyKey)} in seconds`,
        });
        (this as any)[cacheKey] = histogram;
      }
      
      const timer = histogram.startTimer();
      try {
        return await originalMethod.apply(this, args);
      } finally {
        timer();
      }
    };
    
    return descriptor;
  };
}

export function Counted(counterName?: string, labels?: Record<string, string>): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const metricName = counterName || `${target.constructor.name}_${String(propertyKey)}_total`;
    
    descriptor.value = async function (...args: any[]) {
      const registry = (this as any).__metricsRegistry;
      
      if (!registry) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Telemetry] @Counted decorator on ${target.constructor.name}.${String(propertyKey)} ` +
            `requires extending MetricsProvider or manually setting __metricsRegistry. ` +
            `Metrics will not be recorded.`
          );
        }
        return originalMethod.apply(this, args);
      }
      
      const cacheKey = `__counted_${metricName}`;
      let counter = (this as any)[cacheKey];
      
      if (!counter) {
        counter = registry.createCounter({
          name: metricName,
          help: `Total calls to ${String(propertyKey)}`,
        });
        (this as any)[cacheKey] = counter;
      }
      counter.inc(labels);
      
      return originalMethod.apply(this, args);
    };
    
    return descriptor;
  };
}

export { METRIC_METADATA, METRICS_PROVIDER_FLAG };
