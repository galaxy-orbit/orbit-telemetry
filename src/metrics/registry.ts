import { Injectable } from '@galaxy-stack/orbit-core';
import type { Metric, CounterOptions, GaugeOptions, HistogramOptions, Counter, Gauge, Histogram } from './metric.interface';
import { CounterMetric } from './counter';
import { GaugeMetric } from './gauge';
import { HistogramMetric } from './histogram';

@Injectable()
export class MetricsRegistry {
  private metrics: Map<string, Metric> = new Map();
  private defaultLabels: Record<string, string> = {};

  setDefaultLabels(labels: Record<string, string>): void {
    this.defaultLabels = { ...labels };
  }

  getDefaultLabels(): Record<string, string> {
    return { ...this.defaultLabels };
  }

  createCounter(options: CounterOptions): Counter {
    if (this.metrics.has(options.name)) {
      const existing = this.metrics.get(options.name)!;
      if (existing.type !== 'counter') {
        throw new Error(`Metric ${options.name} already exists with different type: ${existing.type}`);
      }
      return existing as Counter;
    }
    
    const counter = new CounterMetric(options);
    this.metrics.set(options.name, counter);
    return counter;
  }

  createGauge(options: GaugeOptions): Gauge {
    if (this.metrics.has(options.name)) {
      const existing = this.metrics.get(options.name)!;
      if (existing.type !== 'gauge') {
        throw new Error(`Metric ${options.name} already exists with different type: ${existing.type}`);
      }
      return existing as Gauge;
    }
    
    const gauge = new GaugeMetric(options);
    this.metrics.set(options.name, gauge);
    return gauge;
  }

  createHistogram(options: HistogramOptions): Histogram {
    if (this.metrics.has(options.name)) {
      const existing = this.metrics.get(options.name)!;
      if (existing.type !== 'histogram') {
        throw new Error(`Metric ${options.name} already exists with different type: ${existing.type}`);
      }
      return existing as Histogram;
    }
    
    const histogram = new HistogramMetric(options);
    this.metrics.set(options.name, histogram);
    return histogram;
  }

  getMetric(name: string): Metric | undefined {
    return this.metrics.get(name);
  }

  getMetrics(): Map<string, Metric> {
    return new Map(this.metrics);
  }

  removeMetric(name: string): boolean {
    return this.metrics.delete(name);
  }

  clear(): void {
    this.metrics.clear();
  }

  resetAll(): void {
    for (const metric of this.metrics.values()) {
      metric.reset();
    }
  }

  collect(): string {
    const output: string[] = [];
    
    for (const metric of this.metrics.values()) {
      output.push(metric.collect());
      output.push('');
    }
    
    return output.join('\n').trim();
  }

  getContentType(): string {
    return 'text/plain; version=0.0.4; charset=utf-8';
  }
}
