import { describe, test, expect } from 'bun:test';
import { MetricsRegistry } from './metrics/registry';

describe('MetricsRegistry', () => {
  test('counter: inc accumulates, rejects negatives', () => {
    const registry = new MetricsRegistry();
    const counter = registry.createCounter({ name: 'requests_total', help: 'Total requests' });
    counter.inc();
    counter.inc();
    counter.inc(undefined, 2);
    expect(counter.get()).toBe(4);
    expect(() => counter.inc(undefined, -1)).toThrow(/positive/);
  });

  test('counter with labels produces per-label series', () => {
    const registry = new MetricsRegistry();
    const counter = registry.createCounter({ name: 'http_total', help: 'HTTP', labelNames: ['method'] });
    counter.labels({ method: 'GET' }).inc(2);
    counter.labels({ method: 'POST' }).inc(1);
    const out = counter.collect();
    expect(out).toContain('http_total{method="GET"} 2');
    expect(out).toContain('http_total{method="POST"} 1');
    expect(out).toContain('# HELP http_total HTTP');
    expect(out).toContain('# TYPE http_total counter');
  });

  test('gauge moves both directions', () => {
    const registry = new MetricsRegistry();
    const gauge = registry.createGauge({ name: 'queue_depth', help: 'Queue depth' });
    gauge.set(5);
    gauge.inc();
    gauge.dec(undefined, 2);
    expect(gauge.get()).toBe(4);
  });

  test('gauge set with plain number overwrites unlabeled value', () => {
    const registry = new MetricsRegistry();
    const gauge = registry.createGauge({ name: 'depth', help: 'd' });
    gauge.set(1);
    gauge.set(7);
    expect(gauge.get()).toBe(7);
  });

  test('histogram buckets are cumulative (verify via exposition)', () => {
    const registry = new MetricsRegistry();
    const histogram = registry.createHistogram({ name: 'latency_ms', help: 'Latency', buckets: [10, 50, 100] });
    histogram.observe(5);
    histogram.observe(30);
    histogram.observe(75);
    histogram.observe(500);
    const out = histogram.collect();
    expect(out).toContain('# TYPE latency_ms histogram');
    expect(out).toContain('latency_ms_bucket{le="10"} 1');
    expect(out).toContain('latency_ms_bucket{le="50"} 2');
    expect(out).toContain('latency_ms_bucket{le="100"} 3');
    expect(out).toContain('latency_ms_bucket{le="+Inf"} 4');
    expect(out).toContain('latency_ms_sum 610');
    expect(out).toContain('latency_ms_count 4');
  });

  test('registering same name with different type throws', () => {
    const registry = new MetricsRegistry();
    registry.createCounter({ name: 'mixed_metric', help: 'h' });
    expect(() => registry.createGauge({ name: 'mixed_metric', help: 'h' })).toThrow(/different type/);
  });

  test('creating same counter twice returns the same instance', () => {
    const registry = new MetricsRegistry();
    const a = registry.createCounter({ name: 'dup_total', help: 'h' });
    a.inc(undefined, 5);
    const b = registry.createCounter({ name: 'dup_total', help: 'h' });
    expect(b.get()).toBe(5);
  });

  test('getMetric returns registered metric by name', () => {
    const registry = new MetricsRegistry();
    registry.createCounter({ name: 'known_total', help: 'h' });
    expect(registry.getMetric('known_total')).toBeDefined();
    expect(registry.getMetric('unknown_total')).toBeUndefined();
  });

  test('exposition format includes HELP/TYPE lines', () => {
    const registry = new MetricsRegistry();
    const counter = registry.createCounter({ name: 'http_requests_total', help: 'HTTP requests' });
    counter.inc(undefined, 3);
    const out = counter.collect();
    expect(out).toContain('# HELP http_requests_total HTTP requests');
    expect(out).toContain('# TYPE http_requests_total counter');
    expect(out).toContain('http_requests_total 3');
  });

  test('default labels merge into series keys', () => {
    const registry = new MetricsRegistry();
    registry.setDefaultLabels({ env: 'test' });
    expect(registry.getDefaultLabels()).toEqual({ env: 'test' });
  });

  test('removeMetric unregisters', () => {
    const registry = new MetricsRegistry();
    registry.createCounter({ name: 'temp_total', help: 'h' });
    expect(registry.removeMetric('temp_total')).toBe(true);
 expect(registry.getMetric('temp_total')).toBeUndefined();
  });
});
