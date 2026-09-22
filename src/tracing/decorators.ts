import 'reflect-metadata';
import type { SpanOptions } from './trace.interface';
import { SpanKind, SpanStatusCode } from './trace.interface';

const TRACE_METADATA = Symbol('telemetry:trace');

export interface TraceOptions extends Omit<SpanOptions, 'startTime'> {
  name?: string;
}

export function Trace(options: TraceOptions = {}): MethodDecorator {
  return (target: any, propertyKey: string | symbol, descriptor: PropertyDescriptor) => {
    const originalMethod = descriptor.value;
    const defaultName = `${target.constructor.name}.${String(propertyKey)}`;
    
    descriptor.value = async function (...args: any[]) {
      const tracer = (this as any).__tracer;
      
      if (!tracer) {
        if (process.env.NODE_ENV !== 'production') {
          console.warn(
            `[Telemetry] @Trace decorator on ${defaultName} ` +
            `requires injecting Tracer or extending TracingProvider. ` +
            `Tracing will be skipped.`
          );
        }
        return originalMethod.apply(this, args);
      }
      
      const spanName = options.name || defaultName;
      
      return tracer.startActiveSpan(spanName, {
        kind: options.kind ?? SpanKind.INTERNAL,
        attributes: options.attributes,
      }, async (span: any) => {
        try {
          const result = await originalMethod.apply(this, args);
          span.setStatus({ code: SpanStatusCode.OK });
          return result;
        } catch (error) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error instanceof Error ? error.message : String(error),
          });
          span.setAttribute('error.type', error instanceof Error ? error.name : 'Error');
          span.setAttribute('error.message', error instanceof Error ? error.message : String(error));
          throw error;
        }
      });
    };
    
    Reflect.defineMetadata(TRACE_METADATA, options, target, propertyKey);
    
    return descriptor;
  };
}

export function TraceSpan(name: string, kind?: SpanKind): MethodDecorator {
  return Trace({ name, kind });
}

export { TRACE_METADATA };
