import { Injectable } from '@galaxy-stack/orbit-core';
import { MetricsRegistry } from '../metrics/registry';
import type { Gauge, Counter } from '../metrics/metric.interface';

@Injectable()
export class DefaultCollectors {
  private processStartTime: Gauge;
  private nodeVersion: Gauge;
  private bunVersion: Gauge;
  private heapUsed: Gauge;
  private heapTotal: Gauge;
  private memoryRss: Gauge;
  private eventLoopLag: Gauge;
  private uptimeSeconds: Gauge;
  private gcCollections: Counter;

  private collectInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly registry: MetricsRegistry) {
    this.processStartTime = this.registry.createGauge({
      name: 'process_start_time_seconds',
      help: 'Start time of the process since unix epoch in seconds',
    });

    this.nodeVersion = this.registry.createGauge({
      name: 'nodejs_version_info',
      help: 'Node.js version info',
      labelNames: ['version', 'major', 'minor', 'patch'],
    });

    this.bunVersion = this.registry.createGauge({
      name: 'bun_version_info',
      help: 'Bun version info',
      labelNames: ['version'],
    });

    this.heapUsed = this.registry.createGauge({
      name: 'nodejs_heap_size_used_bytes',
      help: 'Process heap size used in bytes',
    });

    this.heapTotal = this.registry.createGauge({
      name: 'nodejs_heap_size_total_bytes',
      help: 'Process heap size total in bytes',
    });

    this.memoryRss = this.registry.createGauge({
      name: 'process_resident_memory_bytes',
      help: 'Resident memory size in bytes',
    });

    this.eventLoopLag = this.registry.createGauge({
      name: 'nodejs_eventloop_lag_seconds',
      help: 'Lag of event loop in seconds',
    });

    this.uptimeSeconds = this.registry.createGauge({
      name: 'process_uptime_seconds',
      help: 'Process uptime in seconds',
    });

    this.gcCollections = this.registry.createCounter({
      name: 'nodejs_gc_runs_total',
      help: 'Total number of GC runs',
      labelNames: ['gc_type'],
    });

    this.collectStatic();
  }

  private collectStatic(): void {
    const startTime = Date.now() / 1000;
    this.processStartTime.set(startTime);

    if (typeof Bun !== 'undefined') {
      const version = Bun.version;
      this.bunVersion.set({ version }, 1);
    }

    if (typeof process !== 'undefined' && process.version) {
      const version = process.version;
      const match = version.match(/v(\d+)\.(\d+)\.(\d+)/);
      if (match) {
        this.nodeVersion.set({ 
          version, 
          major: match[1], 
          minor: match[2], 
          patch: match[3] 
        }, 1);
      }
    }
  }

  startCollecting(intervalMs = 10000): void {
    if (this.collectInterval) {
      return;
    }

    this.collect();
    this.collectInterval = setInterval(() => this.collect(), intervalMs);
  }

  stopCollecting(): void {
    if (this.collectInterval) {
      clearInterval(this.collectInterval);
      this.collectInterval = null;
    }
  }

  collect(): void {
    if (typeof process !== 'undefined' && process.memoryUsage) {
      const mem = process.memoryUsage();
      this.heapUsed.set(mem.heapUsed);
      this.heapTotal.set(mem.heapTotal);
      this.memoryRss.set(mem.rss);
    }

    if (typeof process !== 'undefined' && process.uptime) {
      this.uptimeSeconds.set(process.uptime());
    }

    this.measureEventLoopLag();
  }

  private measureEventLoopLag(): void {
    const start = performance.now();
    setTimeout(() => {
      const lag = (performance.now() - start - 0) / 1000;
      this.eventLoopLag.set(Math.max(0, lag));
    }, 0);
  }
}
