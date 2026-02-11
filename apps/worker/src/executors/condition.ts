/**
 * Orkestr — Condition Executor
 *
 * Evaluates a deterministic rule against the step input.
 * Routes true → next step, false → end (or onFalse target).
 */
import * as vm from 'vm';
import { StepContext, StepResult } from './types';

export async function executeCondition(ctx: StepContext): Promise<StepResult> {
  const rule = ctx.config.rule as string;
  if (!rule) {
    throw new Error(`Condition step "${ctx.stepKey}" missing "rule" in config`);
  }

  let result: boolean;
  try {
    // Safe sandbox evaluation — input fields become globals
    const raw = vm.runInNewContext(rule, { ...ctx.input }, { timeout: 1000 });
    result = Boolean(raw);
  } catch (err: any) {
    throw new Error(`Condition "${ctx.stepKey}" evaluation failed: ${err.message}`);
  }

  console.log(`[Condition] "${ctx.stepKey}": rule="${rule}" → ${result}`);

  return {
    output: {
      result,
      rule,
      evaluatedWith: ctx.input,
    },
    // false → skip to end step (or explicit onFalse target)
    nextStepKey: result ? undefined : ((ctx.config.onFalse as string) || '__end__'),
  };
}
