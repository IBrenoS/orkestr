/**
 * Orkestr — Worker (Sprint 1)
 *
 * Consumes the "step-runs" BullMQ queue.
 * Each job processes one step_run: execute → advance → dispatch next.
 *
 * Retry/backoff is configured per-job by the dispatcher.
 * Failed jobs (after max attempts) trigger DLQ handling.
 */
import { PrismaClient } from '@prisma/client';
import { Worker, Queue } from 'bullmq';
import IORedis from 'ioredis';
import { StepRunner } from './step-runner';

const prisma = new PrismaClient({ log: ['warn', 'error'] });

const redisConnection = new IORedis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  maxRetriesPerRequest: null,
});

const stepQueue = new Queue('step-runs', { connection: redisConnection });
const stepRunner = new StepRunner(prisma, stepQueue);

// ─── Step-Run Processor ──────────────────────────────────────

const worker = new Worker(
  'step-runs',
  async (job) => {
    const { stepRunId } = job.data;
    console.log(
      `[Worker] Processing step_run: ${stepRunId} (attempt ${job.attemptsMade + 1})`,
    );

    // Sync attempt number to the database
    await prisma.stepRun.update({
      where: { id: stepRunId },
      data: { attempt: job.attemptsMade + 1 },
    });

    await stepRunner.process(stepRunId);

    console.log(`[Worker] Step ${stepRunId} processed successfully`);
  },
  {
    connection: redisConnection,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY || '5', 10),
  },
);

// ─── Event handlers ──────────────────────────────────────────

worker.on('completed', (job) => {
  console.log(`[Worker] Job ${job.id} completed`);
});

worker.on('failed', async (job, err) => {
  if (!job) return;
  const { stepRunId } = job.data;
  const maxAttempts = job.opts?.attempts || 1;
  const isFinalFailure = job.attemptsMade >= maxAttempts;

  console.error(
    `[Worker] Job ${job.id} failed ` +
    `(attempt ${job.attemptsMade}/${maxAttempts}): ${err.message}`,
  );

  if (isFinalFailure) {
    // DLQ: all retries exhausted → mark step/run as FAILED
    console.error(`[Worker] Step ${stepRunId} → FAILED (DLQ)`);
    await stepRunner.handleFailure(stepRunId, err.message, job.attemptsMade);
  } else {
    // Intermediate failure: mark step as RETRYING
    try {
      const stepRun = await prisma.stepRun.findUnique({
        where: { id: stepRunId },
      });
      if (stepRun) {
        await prisma.stepRun.update({
          where: { id: stepRunId },
          data: { status: 'RETRYING', error: err.message },
        });
        await prisma.runLog.create({
          data: {
            runId: stepRun.runId,
            level: 'warn',
            message:
              `Step "${stepRun.stepKey}" failed (attempt ${job.attemptsMade}/${maxAttempts}), ` +
              `will retry: ${err.message}`,
            context: {
              stepRunId,
              attempt: job.attemptsMade,
              maxAttempts,
              error: err.message,
            } as any,
          },
        });
      }
    } catch (logErr) {
      console.error('[Worker] Failed to log retry:', logErr);
    }
  }
});

// ─── Graceful shutdown ──────────────────────────────────────

async function shutdown() {
  console.log('[Worker] Shutting down...');
  await worker.close();
  await stepQueue.close();
  await redisConnection.quit();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

// ─── Startup ─────────────────────────────────────────────────

async function main() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    console.log('[Worker] Database connected');
  } catch (err) {
    console.error('[Worker] Failed to connect to database:', err);
    process.exit(1);
  }

  try {
    await redisConnection.ping();
    console.log('[Worker] Redis connected');
  } catch (err) {
    console.error('[Worker] Failed to connect to Redis:', err);
    process.exit(1);
  }

  console.log('[Worker] Ready — consuming "step-runs" queue...');
}

main();
