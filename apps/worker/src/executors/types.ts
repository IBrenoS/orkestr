/**
 * Orkestr — Step Executor Types
 *
 * Shared interfaces for all step executors.
 */

/** Context passed to every executor */
export interface StepContext {
  stepRunId: string;
  runId: string;
  stepKey: string;
  stepType: string;
  input: Record<string, unknown>;
  config: Record<string, unknown>;
  attempt: number;
}

/** Result returned by every executor */
export interface StepResult {
  /** Structured output saved on the step_run */
  output: Record<string, unknown>;
  /** External reference for idempotency (actions only) */
  providerRef?: string;
  /** Override next step key — e.g. condition false → "__end__" */
  nextStepKey?: string;
}
