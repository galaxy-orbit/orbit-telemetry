import type { Counter, CounterOptions, MetricLabels } from './metric.interface';

export class CounterMetric implements Counter {
  readonly name: string;
  readonly help: string;
  readonly type = 'counter' as const;
  readonly labelNames: string[];
  
  private values: Map<string, number> = new Map();

  constructor(options: CounterOptions) {
    this.name = options.name;
    this.help = options.help;
    this.labelNames = options.labelNames || [];
    this.values.set('', 0);
  }

  inc(labels?: MetricLabels, value = 1): void {
    if (value < 0) {
      throw new Error('Counter can only be incremented with positive values');
    }
    
    const key = this.getKey(labels);
    const current = this.values.get(key) || 0;
    this.values.set(key, current + value);
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
    lines.push(`# TYPE ${this.name} counter`);
    
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

  labels(labels: MetricLabels): { inc: (value?: number) => void } {
    return {
      inc: (value = 1) => this.inc(labels, value),
    };
  }
}
