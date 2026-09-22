import type { Gauge, GaugeOptions, MetricLabels } from './metric.interface';

export class GaugeMetric implements Gauge {
  readonly name: string;
  readonly help: string;
  readonly type = 'gauge' as const;
  readonly labelNames: string[];
  
  private values: Map<string, number> = new Map();

  constructor(options: GaugeOptions) {
    this.name = options.name;
    this.help = options.help;
    this.labelNames = options.labelNames || [];
    this.values.set('', 0);
  }

  set(labels: MetricLabels | number, value?: number): void {
    if (typeof labels === 'number') {
      this.values.set('', labels);
    } else {
      const key = this.getKey(labels);
      this.values.set(key, value ?? 0);
    }
  }

  inc(labels?: MetricLabels, value = 1): void {
    const key = this.getKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
  }

  dec(labels?: MetricLabels, value = 1): void {
    const key = this.getKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current - value);
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
    lines.push(`# TYPE ${this.name} gauge`);
    
    for (const [key, value] of this.values) {
      if (key === '') {
        lines.push(`${this.name} ${value}`);
      } else {
        lines.push(`${this.name}{${key}} ${value}`);
      }
    }
    
    return lines.join('\n');
  }

  reset(): void {
    this.values.clear();
    this.values.set('', 0);
  }

  get(): number {
    return this.values.get('') || 0;
  }

  labels(labels: MetricLabels): { set: (value: number) => void; inc: (value?: number) => void; dec: (value?: number) => void } {
    return {
      set: (value: number) => this.set(labels, value),
      inc: (value = 1) => this.inc(labels, value),
      dec: (value = 1) => this.dec(labels, value),
    };
  }
}
