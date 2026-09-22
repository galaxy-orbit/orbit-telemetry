export type MetricType = 'counter' | 'gauge' | 'histogram' | 'summary';

export interface MetricLabels {
  [key: string]: string | number;
}

export interface MetricOptions {
  name: string;
  help: string;
  labelNames?: string[];
  buckets?: number[];
  percentiles?: number[];
}

export interface CounterOptions extends MetricOptions {}

export interface GaugeOptions extends MetricOptions {}

export interface HistogramOptions extends MetricOptions {
  buckets?: number[];
}

export interface SummaryOptions extends MetricOptions {
  percentiles?: number[];
  maxAgeSeconds?: number;
  ageBuckets?: number;
}

export interface Metric {
  readonly name: string;
  readonly help: string;
  readonly type: MetricType;
  readonly labelNames: string[];
  collect(): string;
  reset(): void;
}

export interface Counter extends Metric {
  inc(labels?: MetricLabels, value?: number): void;
}

export interface Gauge extends Metric {
  set(labels: MetricLabels | number, value?: number): void;
  inc(labels?: MetricLabels, value?: number): void;
  dec(labels?: MetricLabels, value?: number): void;
}

export interface Histogram extends Metric {
  observe(labels: MetricLabels | number, value?: number): void;
  startTimer(labels?: MetricLabels): () => number;
}

export interface Summary extends Metric {
  observe(labels: MetricLabels | number, value?: number): void;
}

export const DEFAULT_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10];
export const DEFAULT_PERCENTILES = [0.5, 0.9, 0.95, 0.99];

export const METRICS_REGISTRY = Symbol('METRICS_REGISTRY');
export const METRICS_OPTIONS = Symbol('METRICS_OPTIONS');
