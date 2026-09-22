import type { Sampler, SpanContext } from './trace.interface';

export class AlwaysOnSampler implements Sampler {
  shouldSample(): boolean {
    return true;
  }
}

export class AlwaysOffSampler implements Sampler {
  shouldSample(): boolean {
    return false;
  }
}

export class ProbabilitySampler implements Sampler {
  private readonly threshold: number;

  constructor(probability: number) {
    this.threshold = Math.max(0, Math.min(1, probability));
  }

  shouldSample(): boolean {
    return Math.random() < this.threshold;
  }
}

export class RateLimitingSampler implements Sampler {
  private readonly maxTracesPerSecond: number;
  private tokenBucket: number;
  private lastRefill: number;

  constructor(maxTracesPerSecond: number) {
    this.maxTracesPerSecond = maxTracesPerSecond;
    this.tokenBucket = maxTracesPerSecond;
    this.lastRefill = Date.now();
  }

  shouldSample(): boolean {
    this.refillBucket();
    
    if (this.tokenBucket >= 1) {
      this.tokenBucket -= 1;
      return true;
    }
    
    return false;
  }

  private refillBucket(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.maxTracesPerSecond;
    
    this.tokenBucket = Math.min(this.maxTracesPerSecond, this.tokenBucket + tokensToAdd);
    this.lastRefill = now;
  }
}

export class ParentBasedSampler implements Sampler {
  private readonly root: Sampler;

  constructor(root: Sampler = new AlwaysOnSampler()) {
    this.root = root;
  }

  shouldSample(context: SpanContext, name: string): boolean {
    if (context.traceFlags & 1) {
      return true;
    }
    
    return this.root.shouldSample(context, name);
  }
}
