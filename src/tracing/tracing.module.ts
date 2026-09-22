import { Module } from '@galaxy-stack/orbit-core';
import type { DynamicModule, Provider } from '@galaxy-stack/orbit-core';
import { Tracer } from './tracer';
import { TracingMiddleware, type TracingMiddlewareOptions } from './middleware';
import type { SpanExporter, Sampler, TracerOptions } from './trace.interface';
import { TRACER_OPTIONS } from './trace.interface';

export interface TracingModuleOptions {
  serviceName: string;
  serviceVersion?: string;
  exporter?: SpanExporter;
  sampler?: Sampler;
  batchSize?: number;
  flushInterval?: number;
  middleware?: TracingMiddlewareOptions;
  isGlobal?: boolean;
}

export const TRACER = Symbol('TRACER');
export const TRACING_MIDDLEWARE_OPTIONS = Symbol('TRACING_MIDDLEWARE_OPTIONS');

@Module({})
export class TracingModule {
  static forRoot(options: TracingModuleOptions): DynamicModule {
    const tracerOptions: TracerOptions = {
      serviceName: options.serviceName,
      serviceVersion: options.serviceVersion,
      exporter: options.exporter,
      sampler: options.sampler,
    };

    const providers: Provider[] = [
      {
        provide: TRACER_OPTIONS,
        useValue: tracerOptions,
      },
      {
        provide: TRACING_MIDDLEWARE_OPTIONS,
        useValue: options.middleware || {},
      },
      {
        provide: Tracer,
        useFactory: () => new Tracer({
          name: options.serviceName,
          version: options.serviceVersion,
          exporter: options.exporter,
          sampler: options.sampler,
          batchSize: options.batchSize,
          flushInterval: options.flushInterval,
        }),
      },
      {
        provide: TRACER,
        useExisting: Tracer,
      },
      {
        provide: TracingMiddleware,
        useFactory: (tracer: Tracer, middlewareOptions: TracingMiddlewareOptions) => {
          return new TracingMiddleware(tracer, middlewareOptions);
        },
        inject: [Tracer, TRACING_MIDDLEWARE_OPTIONS],
      },
    ];

    return {
      module: TracingModule,
      global: options.isGlobal ?? true,
      providers,
      exports: [Tracer, TRACER, TRACER_OPTIONS, TracingMiddleware],
    };
  }
}
