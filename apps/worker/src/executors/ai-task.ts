/**
 * Orkestr — AI Task Executor (Sprint 1: Passthrough)
 *
 * Sprint 1 has no AI yet. Always uses fallback — passes input through.
 * Real AI integration comes in Sprint 2+.
 */
import { StepContext, StepResult } from './types';

export async function executeAiTask(ctx: StepContext): Promise<StepResult> {
  const fallback = (ctx.config.fallback as string) || 'passthrough';

  console.log(
    `[AI Task] Fallback "${fallback}" for "${ctx.stepKey}" — AI not active yet (Sprint 1)`,
  );

  return {
    output: {
      fallbackUsed: true,
      fallback,
      data: ctx.input,
    },
  };
}
