import { Injectable, type OnModuleInit, type OnModuleDestroy } from '@galaxy-stack/orbit-core';
import { Tracer } from './tracer';

@Injectable()
export abstract class TracingProvider implements OnModuleInit, OnModuleDestroy {
  protected __tracer: Tracer;

  constructor(protected readonly tracer: Tracer) {
    this.__tracer = tracer;
  }

  onModuleInit(): void {
  }

  async onModuleDestroy(): Promise<void> {
    await this.tracer.shutdown();
  }
}
