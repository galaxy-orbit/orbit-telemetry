import 'reflect-metadata';

export type {
  MetricOptions,
  CounterOptions,
  GaugeOptions,
  HistogramOptions,
  Metric,
} from './metrics/metric.interface';
export * from './metrics/counter';
export * from './metrics/gauge';
export * from './metrics/histogram';
export * from './metrics/registry';
export * from './metrics/metrics-provider';

export * from './decorators/metric.decorators';

export * from './middleware/metrics.middleware';

export * from './collectors/default.collectors';

export {
  MetricsModule,
  type MetricsModuleOptions,
  METRICS_PATH,
  METRICS_OPTIONS,
} from './telemetry.module';

export * from './tracing';
