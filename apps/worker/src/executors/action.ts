/**
 * Orkestr — Action Executor
 *
 * Fires a real-world action (webhook or dry-run).
 * Returns providerRef for idempotency tracking.
 */
import { randomUUID } from 'node:crypto';
import { StepContext, StepResult } from './types';

export async function executeAction(ctx: StepContext): Promise<StepResult> {
  const actionType = (ctx.config.type as string) || (ctx.config.channel as string) || 'log';

  // ── Webhook: real HTTP call ──────────────────────────────
  if (actionType === 'webhook' && ctx.config.url) {
    const url = ctx.config.url as string;
    const method = (ctx.config.method as string) || 'POST';

    console.log(`[Action] Webhook ${method} ${url} (step: ${ctx.stepKey})`);

    const response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Idempotency-Key': ctx.stepRunId, // external dedup key
      },
      body: JSON.stringify({
        stepRunId: ctx.stepRunId,
        runId: ctx.runId,
        stepKey: ctx.stepKey,
        input: ctx.input,
        attempt: ctx.attempt,
      }),
      signal: AbortSignal.timeout(10_000),
    });

    if (!response.ok) {
      throw new Error(`Webhook ${method} ${url} failed: ${response.status} ${response.statusText}`);
    }

    const providerRef = response.headers.get('x-request-id') || randomUUID();
    const body = await response.json().catch(() => ({}));

    return {
      output: { status: response.status, body, url, method },
      providerRef,
    };
  }

  // ── Dry-run: log-only (email, log, etc.) ─────────────────
  const providerRef = `dry-run-${randomUUID()}`;
  console.log(
    `[Action] Dry-run: type=${actionType}, step=${ctx.stepKey}, ` +
    `input=${JSON.stringify(ctx.input).substring(0, 200)}`,
  );

  return {
    output: {
      dryRun: true,
      actionType,
      inputKeys: Object.keys(ctx.input),
      description: ctx.config.description || null,
    },
    providerRef,
  };
}
