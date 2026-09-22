import type { Histogram, HistogramOptions, MetricLabels } from './metric.interface';
import { DEFAULT_BUCKETS } from './metric.interface';

interface BucketData {
  count: number;
  sum: number;
  buckets: Map<number, number>;
}

export class HistogramMetric implements Histogram {
  readonly name: string;
  readonly help: string;
  readonly type = 'histogram' as const;
  readonly labelNames: string[];
  readonly buckets: number[];
  
  private data: Map<string, BucketData> = new Map();

  constructor(options: HistogramOptions) {
    this.name = options.name;
    this.help = options.help;
    this.labelNames = options.labelNames || [];
    this.buckets = (options.buckets || DEFAULT_BUCKETS).sort((a, b) => a - b);
    this.initBuckets('');
  }

  private initBuckets(key: string): void {
    const buckets = new Map<number, number>();
    for (const bucket of this.buckets) {
      buckets.set(bucket, 0);
    }
    buckets.set(Infinity, 0);
    
    this.data.set(key, {
      count: 0,
      sum: 0,
      buckets,
    });
  }

  observe(labels: MetricLabels | number, value?: number): void {
    let actualLabels: MetricLabels | undefined;
    let actualValue: number;
    
    if (typeof labels === 'number') {
      actualValue = labels;
    } else {
      actualLabels = labels;
      actualValue = value ?? 0;
    }
    
    const key = this.getKey(actualLabels);
    
    if (!this.data.has(key)) {
      this.initBuckets(key);
    }
    
    const data = this.data.get(key)!;
    data.count++;
    data.sum += actualValue;
    
    for (const bucket of this.buckets) {
      if (actualValue <= bucket) {
        data.buckets.set(bucket, (data.buckets.get(bucket) || 0) + 1);
      }
    }
    data.buckets.set(Infinity, (data.buckets.get(Infinity) || 0) + 1);
  }

  startTimer(labels?: MetricLabels): () => number {
    const start = performance.now();
    return () => {
      const duration = (performance.now() - start) / 1000;
      this.observe(labels || {}, duration);
      return duration;
    };
  }

  private getKey(labels?: MetricLabels): string {
    if (!labels || Object.keys(labels).length === 0) {
      return '';
    }
    
    const sortedKeys = Object.keys(labels).sort();
    return sortedKeys.map(k => `${k}="${labels[k]}"`).join(',');
  }

  collect(): string {
    const lines: string[] = [];
    lines.push(`# HELP ${this.name} ${this.help}`);
    lines.push(`# TYPE ${this.name} histogram`);
    
    for (const [key, data] of this.data) {
      const labelPrefix = key ? `{${key}}` : '';
      
      for (const bucket of this.buckets) {
        const bucketCount = this.getCumulativeBucketCount(data, bucket);
        if (key) {
          lines.push(`${this.name}_bucket{${key},le="${bucket}"} ${bucketCount}`);
        } else {
          lines.push(`${this.name}_bucket{le="${bucket}"} ${bucketCount}`);
        }
      }
      
      if (key) {
        lines.push(`${this.name}_bucket{${key},le="+Inf"} ${data.count}`);
        lines.push(`${this.name}_sum{${key}} ${data.sum}`);
        lines.push(`${this.name}_count{${key}} ${data.count}`);
      } else {
        lines.push(`${this.name}_bucket{le="+Inf"} ${data.count}`);
        lines.push(`${this.name}_sum ${data.sum}`);
        lines.push(`${this.name}_count ${data.count}`);
      }
    }
    
    return lines.join('\n');
  }

  private getCumulativeBucketCount(data: BucketData, bucket: number): number {
    // observe() already increments every bucket >= value, so each bucket
    // entry is already cumulative — do not sum them again
    return data.buckets.get(bucket) || 0;
  }

  reset(): void {
    this.data.clear();
    this.initBuckets('');
  }

  labels(labels: MetricLabels): { observe: (value: number) => void; startTimer: () => () => number } {
    return {
      observe: (value: number) => this.observe(labels, value),
      startTimer: () => this.startTimer(labels),
    };
  }
}
