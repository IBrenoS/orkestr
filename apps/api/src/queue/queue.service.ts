import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { Queue } from 'bullmq';
import IORedis from 'ioredis';

@Injectable()
export class QueueService implements OnModuleDestroy {
  private readonly connection: IORedis;
  private readonly stepQueue: Queue;

  constructor() {
    this.connection = new IORedis({
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379', 10),
      maxRetriesPerRequest: null,
    });

    this.stepQueue = new Queue('step-runs', { connection: this.connection });
  }

  /**
   * Dispatch a step_run to the worker queue.
   * Retry config varies by step type:
   *  - action: 3 attempts, exponential backoff (1s base)
   *  - everything else: 1 attempt, no retry
   */
  async dispatchStep(stepRunId: string, stepType: string) {
    const isAction = stepType === 'action';

    await this.stepQueue.add(
      'execute-step',
      { stepRunId },
      {
        attempts: isAction ? 3 : 1,
        backoff: isAction
          ? { type: 'exponential' as const, delay: 1000 }
          : undefined,
      },
    );
  }

  async onModuleDestroy() {
    await this.stepQueue.close();
    await this.connection.quit();
  }
}
