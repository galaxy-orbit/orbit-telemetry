import { Injectable } from '@galaxy-stack/orbit-core';

export interface MiddlewareContext {
  request: Request;
  [key: string]: any;
}

export type NextFunction = () => Promise<any>;
import { Tracer } from './tracer';
import { SpanKind, SpanStatusCode } from './trace.interface';
import { extractContext } from './context';

export interface TracingMiddlewareOptions {
  excludePaths?: string[];
  includeHeaders?: boolean;
}

@Injectable()
export class TracingMiddleware {
  private options: TracingMiddlewareOptions;

  constructor(
    private readonly tracer: Tracer,
    options?: TracingMiddlewareOptions
  ) {
    this.options = options || {};
  }

  async use(ctx: MiddlewareContext, next: NextFunction): Promise<void> {
    const { request } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (this.options.excludePaths?.some(p => path.startsWith(p))) {
      return next();
    }
    
    const parentContext = extractContext(request.headers);
    
    const spanName = `${request.method} ${path}`;
    const attributes: Record<string, string | number | boolean> = {
      'http.method': request.method,
      'http.url': request.url,
      'http.target': path,
      'http.host': url.host,
      'http.scheme': url.protocol.replace(':', ''),
      'http.user_agent': request.headers.get('user-agent') || '',
    };
    
    if (this.options.includeHeaders) {
      request.headers.forEach((value: string, key: string) => {
        if (!key.toLowerCase().startsWith('authorization') && 
            !key.toLowerCase().includes('secret') &&
            !key.toLowerCase().includes('cookie')) {
          attributes[`http.request.header.${key.toLowerCase()}`] = value;
        }
      });
    }
    
    const span = this.tracer.startSpan(spanName, {
      kind: SpanKind.SERVER,
      parent: parentContext ?? undefined,
      attributes,
    });
    
    const contextManager = this.tracer.getContextManager();
    
    try {
      await contextManager.withAsync(span, async () => {
        await next();
      });
      
      const status = ctx.response?.status || 200;
      span.setAttribute('http.status_code', status);
      
      if (status >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${status}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      span.setAttribute('error', true);
      span.setAttribute('error.type', error instanceof Error ? error.name : 'Error');
      span.setAttribute('error.message', error instanceof Error ? error.message : String(error));
      throw error;
    } finally {
      span.end();
    }
  }
}

export function createTracingMiddleware(
  tracer: Tracer,
  options: TracingMiddlewareOptions = {}
): (ctx: MiddlewareContext, next: NextFunction) => Promise<void> {
  return async (ctx: MiddlewareContext, next: NextFunction) => {
    const { request } = ctx;
    const url = new URL(request.url);
    const path = url.pathname;
    
    if (options.excludePaths?.some(p => path.startsWith(p))) {
      return next();
    }
    
    const parentContext = extractContext(request.headers);
    
    const spanName = `${request.method} ${path}`;
    const span = tracer.startSpan(spanName, {
      kind: SpanKind.SERVER,
      parent: parentContext ?? undefined,
      attributes: {
        'http.method': request.method,
        'http.url': request.url,
        'http.target': path,
        'http.host': url.host,
      },
    });
    
    const contextManager = tracer.getContextManager();
    
    try {
      await contextManager.withAsync(span, async () => {
        await next();
      });
      
      span.setAttribute('http.status_code', ctx.response?.status || 200);
      span.setStatus({ code: SpanStatusCode.OK });
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    } finally {
      span.end();
    }
  };
}
