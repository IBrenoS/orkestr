/**
 * Orkestr — End Executor
 *
 * Marks the step as completed. The step-runner handles
 * finalizing the run (setting COMPLETED status).
 */
import { StepContext, StepResult } from './types';

export async function executeEnd(_ctx: StepContext): Promise<StepResult> {
  return { output: { finalized: true } };
}
