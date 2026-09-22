export interface SpanContext {
  traceId: string;
  spanId: string;
  traceFlags: number;
  traceState?: string;
}

export interface SpanOptions {
  kind?: SpanKind;
  attributes?: Record<string, string | number | boolean>;
  startTime?: number;
  links?: SpanLink[];
  parent?: SpanContext;
}

export interface SpanLink {
  context: SpanContext;
  attributes?: Record<string, string | number | boolean>;
}

export enum SpanKind {
  INTERNAL = 0,
  SERVER = 1,
  CLIENT = 2,
  PRODUCER = 3,
  CONSUMER = 4,
}

export enum SpanStatusCode {
  UNSET = 0,
  OK = 1,
  ERROR = 2,
}

export interface SpanStatus {
  code: SpanStatusCode;
  message?: string;
}

export interface SpanEvent {
  name: string;
  timestamp: number;
  attributes?: Record<string, string | number | boolean>;
}

export interface ISpan {
  readonly spanContext: SpanContext;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTime: number;
  readonly parentSpanId?: string;
  
  setAttribute(key: string, value: string | number | boolean): ISpan;
  setAttributes(attributes: Record<string, string | number | boolean>): ISpan;
  addEvent(name: string, attributes?: Record<string, string | number | boolean>): ISpan;
  setStatus(status: SpanStatus): ISpan;
  updateName(name: string): ISpan;
  end(endTime?: number): void;
  isRecording(): boolean;
}

export interface ITracer {
  readonly name: string;
  readonly version?: string;
  
  startSpan(name: string, options?: SpanOptions): ISpan;
  startActiveSpan<T>(name: string, fn: (span: ISpan) => T): T;
  startActiveSpan<T>(name: string, options: SpanOptions, fn: (span: ISpan) => T): T;
}

export interface SpanExporter {
  export(spans: ReadonlySpan[]): Promise<void>;
  shutdown(): Promise<void>;
}

export interface ReadonlySpan {
  readonly spanContext: SpanContext;
  readonly name: string;
  readonly kind: SpanKind;
  readonly startTime: number;
  readonly endTime: number;
  readonly duration: number;
  readonly status: SpanStatus;
  readonly attributes: Record<string, string | number | boolean>;
  readonly events: SpanEvent[];
  readonly parentSpanId?: string;
  readonly links: SpanLink[];
}

export interface TracerOptions {
  serviceName: string;
  serviceVersion?: string;
  exporter?: SpanExporter;
  sampler?: Sampler;
}

export interface Sampler {
  shouldSample(context: SpanContext, name: string): boolean;
}

export const TRACER_OPTIONS = Symbol('TRACER_OPTIONS');
export const TRACE_CONTEXT = Symbol('TRACE_CONTEXT');
