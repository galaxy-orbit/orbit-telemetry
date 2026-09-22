import { 
  type ISpan, 
  type SpanContext, 
  type SpanOptions, 
  type SpanStatus, 
  type SpanEvent,
  type SpanLink,
  type ReadonlySpan,
  SpanKind, 
  SpanStatusCode 
} from './trace.interface';

function generateId(length: 16 | 32): string {
  const bytes = new Uint8Array(length / 2);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

export function generateTraceId(): string {
  return generateId(32);
}

export function generateSpanId(): string {
  return generateId(16);
}

export class Span implements ISpan {
  readonly spanContext: SpanContext;
  private _name: string;
  readonly kind: SpanKind;
  readonly startTime: number;
  readonly parentSpanId?: string;
  readonly links: SpanLink[];
  
  private _attributes: Record<string, string | number | boolean> = {};
  private _events: SpanEvent[] = [];
  private _status: SpanStatus = { code: SpanStatusCode.UNSET };
  private _endTime?: number;
  private _isEnded = false;
  
  private onEnd?: (span: ReadonlySpan) => void;

  constructor(
    name: string,
    options: SpanOptions & { 
      onEnd?: (span: ReadonlySpan) => void;
    } = {}
  ) {
    this._name = name;
    this.kind = options.kind ?? SpanKind.INTERNAL;
    this.startTime = options.startTime ?? performance.now();
    this.links = options.links ?? [];
    this.onEnd = options.onEnd;
    
    if (options.parent) {
      this.spanContext = {
        traceId: options.parent.traceId,
        spanId: generateSpanId(),
        traceFlags: options.parent.traceFlags,
        traceState: options.parent.traceState,
      };
      this.parentSpanId = options.parent.spanId;
    } else {
      this.spanContext = {
        traceId: generateTraceId(),
        spanId: generateSpanId(),
        traceFlags: 1,
      };
    }
    
    if (options.attributes) {
      this._attributes = { ...options.attributes };
    }
  }

  get name(): string {
    return this._name;
  }

  setAttribute(key: string, value: string | number | boolean): ISpan {
    if (!this._isEnded) {
      this._attributes[key] = value;
    }
    return this;
  }

  setAttributes(attributes: Record<string, string | number | boolean>): ISpan {
    if (!this._isEnded) {
      Object.assign(this._attributes, attributes);
    }
    return this;
  }

  addEvent(name: string, attributes?: Record<string, string | number | boolean>): ISpan {
    if (!this._isEnded) {
      this._events.push({
        name,
        timestamp: performance.now(),
        attributes,
      });
    }
    return this;
  }

  setStatus(status: SpanStatus): ISpan {
    if (!this._isEnded) {
      this._status = status;
    }
    return this;
  }

  updateName(name: string): ISpan {
    if (!this._isEnded) {
      this._name = name;
    }
    return this;
  }

  end(endTime?: number): void {
    if (this._isEnded) return;
    
    this._endTime = endTime ?? performance.now();
    this._isEnded = true;
    
    if (this.onEnd) {
      this.onEnd(this.toReadonlySpan());
    }
  }

  isRecording(): boolean {
    return !this._isEnded;
  }

  toReadonlySpan(): ReadonlySpan {
    return {
      spanContext: this.spanContext,
      name: this._name,
      kind: this.kind,
      startTime: this.startTime,
      endTime: this._endTime ?? performance.now(),
      duration: (this._endTime ?? performance.now()) - this.startTime,
      status: this._status,
      attributes: { ...this._attributes },
      events: [...this._events],
      parentSpanId: this.parentSpanId,
      links: this.links,
    };
  }
}
