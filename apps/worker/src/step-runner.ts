/**
 * Orkestr — Step Runner
 *
 * Core orchestration engine. Processes one step_run at a time:
 *  1. Load step_run → run → workflow
 *  2. Idempotency check (actions with providerRef)
 *  3. Execute step based on type
 *  4. Advance flow → create next step → dispatch
 *
 * Handles: condition routing, action execution, ai_task fallback, end finalization.
 * Handles: retry state (RETRYING), failure (FAILED → run FAILED).
 */
import { PrismaClient } from '@prisma/client';
import { Queue } from 'bullmq';
import {
  StepContext,
  executeCondition,
  executeAction,
  executeAiTask,
  executeEnd,
} from './executors';

interface StepDef {
  key: string;
  type: string;
  config?: Record<string, unknown>;
}

export class StepRunner {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly queue: Queue,
  ) {}

  // ─── Main entry point ──────────────────────────────────────

  async process(stepRunId: string): Promise<void> {
    // 1. Load step_run with full context
    const stepRun = await this.prisma.stepRun.findUniqueOrThrow({
      where: { id: stepRunId },
      include: { run: { include: { workflow: true, event: true } } },
    });

    const { run } = stepRun;
    const { workflow, event } = run;
    const steps = workflow.steps as unknown as StepDef[];
    const eventPayload = (event.payload as Record<string, unknown>) || {};
    const stepDef = steps.find((s) => s.key === stepRun.stepKey);

    if (!stepDef) {
      throw new Error(
        `Step "${stepRun.stepKey}" not found in workflow "${workflow.name}"`,
      );
    }

    // 2. Mark run as RUNNING on first step
    if (run.status === 'PENDING') {
      await this.prisma.run.update({
        where: { id: run.id },
        data: { status: 'RUNNING', startedAt: new Date() },
      });
      await this.log(run.id, 'info', 'Run started', {
        workflowName: workflow.name,
        workflowVersion: workflow.version,
      });
    }

    // 3. Idempotency: action already executed?
    if (stepRun.stepType === 'action' && stepRun.providerRef) {
      console.log(
        `[StepRunner] Step ${stepRunId} already has providerRef="${stepRun.providerRef}", skipping execution`,
      );
      await this.log(
        run.id,
        'info',
        `Step "${stepRun.stepKey}" skipped — already executed (providerRef: ${stepRun.providerRef})`,
        { stepRunId, providerRef: stepRun.providerRef },
      );

      // Ensure step is COMPLETED and advance
      await this.prisma.stepRun.update({
        where: { id: stepRunId },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      await this.advanceFlow(
        run.id,
        stepRun.stepKey,
        eventPayload,
        steps,
      );
      return;
    }

    // 4. Mark step as RUNNING
    await this.prisma.stepRun.update({
      where: { id: stepRunId },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    await this.log(
      run.id,
      'info',
      `Step "${stepRun.stepKey}" (${stepRun.stepType}) → RUNNING`,
      { stepRunId, attempt: stepRun.attempt },
    );

    // 5. Build executor context
    const ctx: StepContext = {
      stepRunId,
      runId: run.id,
      stepKey: stepRun.stepKey,
      stepType: stepRun.stepType,
      input: (stepRun.input as Record<string, unknown>) || {},
      config: (stepDef.config as Record<string, unknown>) || {},
      attempt: stepRun.attempt,
    };

    // 6. Execute
    const result = await this.dispatch(ctx);

    // 7. Save result
    await this.prisma.stepRun.update({
      where: { id: stepRunId },
      data: {
        status: 'COMPLETED',
        output: result.output as any,
        providerRef: result.providerRef ?? undefined,
        finishedAt: new Date(),
      },
    });

    await this.log(
      run.id,
      'info',
      `Step "${stepRun.stepKey}" (${stepRun.stepType}) → COMPLETED`,
      {
        stepRunId,
        outputKeys: Object.keys(result.output),
        ...(result.providerRef ? { providerRef: result.providerRef } : {}),
      },
    );

    // 8. End step → finalize run
    if (stepRun.stepType === 'end') {
      await this.prisma.run.update({
        where: { id: run.id },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      await this.log(run.id, 'info', 'Run completed successfully', {
        workflowName: workflow.name,
        totalSteps: steps.length,
      });
      return;
    }

    // 9. Advance to next step
    await this.advanceFlow(
      run.id,
      stepRun.stepKey,
      eventPayload,
      steps,
      result.nextStepKey,
    );
  }

  // ─── Executor dispatch ─────────────────────────────────────

  private async dispatch(ctx: StepContext) {
    switch (ctx.stepType) {
      case 'condition':
        return executeCondition(ctx);
      case 'action':
        return executeAction(ctx);
      case 'ai_task':
        return executeAiTask(ctx);
      case 'end':
        return executeEnd(ctx);
      default:
        throw new Error(`Unknown step type: ${ctx.stepType}`);
    }
  }

  // ─── Flow advancement ──────────────────────────────────────

  private async advanceFlow(
    runId: string,
    currentStepKey: string,
    eventPayload: Record<string, unknown>,
    steps: StepDef[],
    overrideNextKey?: string,
  ): Promise<void> {
    let nextStep: StepDef | undefined;

    if (overrideNextKey) {
      // Condition routing: explicit next step
      if (overrideNextKey === '__end__') {
        nextStep = steps.find((s) => s.type === 'end');
      } else {
        nextStep = steps.find((s) => s.key === overrideNextKey);
      }

      await this.log(
        runId,
        'info',
        `Condition routed: "${currentStepKey}" → "${nextStep?.key || 'unknown'}" (branch: false)`,
        { from: currentStepKey, to: nextStep?.key, override: overrideNextKey },
      );
    } else {
      // Linear progression: next step in array
      const currentIndex = steps.findIndex((s) => s.key === currentStepKey);
      if (currentIndex >= 0 && currentIndex < steps.length - 1) {
        nextStep = steps[currentIndex + 1];
      }
    }

    if (!nextStep) {
      await this.log(
        runId,
        'warn',
        `No next step found after "${currentStepKey}" — finalizing run`,
      );
      await this.prisma.run.update({
        where: { id: runId },
        data: { status: 'COMPLETED', finishedAt: new Date() },
      });
      return;
    }

    // Create next step_run — input is always the event payload
    const nextStepRun = await this.prisma.stepRun.create({
      data: {
        runId,
        stepKey: nextStep.key,
        stepType: nextStep.type,
        status: 'PENDING',
        input: eventPayload as any,
      },
    });

    await this.log(
      runId,
      'info',
      `Step "${nextStep.key}" (${nextStep.type}) created as PENDING`,
      { stepRunId: nextStepRun.id, previousStep: currentStepKey },
    );

    // Dispatch with retry config based on step type
    const isAction = nextStep.type === 'action';
    await this.queue.add(
      'execute-step',
      { stepRunId: nextStepRun.id },
      {
        attempts: isAction ? 3 : 1,
        backoff: isAction
          ? { type: 'exponential' as const, delay: 1000 }
          : undefined,
      },
    );
  }

  // ─── Failure handling (DLQ) ────────────────────────────────

  async handleFailure(
    stepRunId: string,
    error: string,
    attempt: number,
  ): Promise<void> {
    const stepRun = await this.prisma.stepRun.findUnique({
      where: { id: stepRunId },
      include: { run: true },
    });

    if (!stepRun) return;

    // Mark step as FAILED
    await this.prisma.stepRun.update({
      where: { id: stepRunId },
      data: {
        status: 'FAILED',
        error,
        attempt,
        finishedAt: new Date(),
      },
    });

    // Mark run as FAILED
    await this.prisma.run.update({
      where: { id: stepRun.runId },
      data: {
        status: 'FAILED',
        error: `Step "${stepRun.stepKey}" failed after ${attempt} attempt(s): ${error}`,
        finishedAt: new Date(),
      },
    });

    await this.log(
      stepRun.runId,
      'error',
      `Step "${stepRun.stepKey}" (${stepRun.stepType}) FAILED after ${attempt} attempt(s)`,
      { stepRunId, stepKey: stepRun.stepKey, stepType: stepRun.stepType, attempt, error },
    );

    await this.log(
      stepRun.runId,
      'error',
      `Run FAILED — step "${stepRun.stepKey}" exhausted all retries`,
      { stepRunId, error },
    );
  }

  // ─── Logging helper ────────────────────────────────────────

  private async log(
    runId: string,
    level: string,
    message: string,
    context?: Record<string, unknown>,
  ): Promise<void> {
    await this.prisma.runLog.create({
      data: {
        runId,
        level,
        message,
        context: (context ?? {}) as any,
      },
    });
  }
}
