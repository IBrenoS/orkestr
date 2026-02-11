/**
 * Orkestr — AI Task Executor (Sprint 2)
 *
 * Executes an AI-assisted step using a real LLM provider.
 *
 * Flow:
 *  1. Build prompt from config + input data
 *  2. Call LLM provider with timeout
 *  3. Validate response against output schema
 *  4. If parse/validation fails → 1 repair attempt (re-prompt with error)
 *  5. If repair fails or provider unavailable → mandatory fallback
 *  6. Log full metadata: model, tokens, latency, prompt_version
 *
 * Config contract (workflow step config):
 *  - systemPrompt: string (required)
 *  - userPromptTemplate: string (with {{field}} interpolation)
 *  - outputSchema: OutputSchema (required for validation)
 *  - promptVersion: string (default "v1")
 *  - model: string (override env default)
 *  - timeoutMs: number (default 15000)
 *  - fallback: string (required — fallback strategy key)
 *  - fallbackData: object (static data returned on fallback)
 */
import { StepContext, StepResult } from './types';
import type {
  AiProvider,
  AiRequest,
  AiResponse,
  OutputSchema,
} from '../ai/types';
import { AiParseError } from '../ai/openai-provider';
import { validateOutputSchema } from '../ai/schema-validator';

// ─── Singleton provider (lazy-loaded) ─────────────────────────

let _provider: AiProvider | null = null;
let _providerError: string | null = null;

function getProvider(): AiProvider | null {
  if (_provider) return _provider;
  if (_providerError) return null; // already failed to init

  try {
    // Dynamic require to avoid crash if OPENAI_API_KEY is not set
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { OpenAiProvider } = require('../ai/openai-provider');
    _provider = new OpenAiProvider();
    return _provider;
  } catch (err: any) {
    _providerError = err.message;
    console.warn(`[AI Task] Provider init failed: ${err.message}`);
    return null;
  }
}

// ─── Template interpolation ───────────────────────────────────

function interpolateTemplate(
  template: string,
  data: Record<string, unknown>,
): string {
  return template.replace(/\{\{(\w+(?:\.\w+)*)\}\}/g, (_match, path: string) => {
    const parts = path.split('.');
    let value: unknown = data;
    for (const part of parts) {
      if (value === null || value === undefined) return '';
      value = (value as Record<string, unknown>)[part];
    }
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value ?? '');
  });
}

// ─── Main executor ────────────────────────────────────────────

export async function executeAiTask(ctx: StepContext): Promise<StepResult> {
  const config = ctx.config;
  const fallbackKey = (config.fallback as string) || 'passthrough';
  const fallbackData = (config.fallbackData as Record<string, unknown>) || {};
  const outputSchema = config.outputSchema as OutputSchema | undefined;
  const promptVersion = (config.promptVersion as string) || 'v1';
  const model = config.model as string | undefined;
  const timeoutMs = (config.timeoutMs as number) || 15_000;
  const systemPrompt = config.systemPrompt as string | undefined;
  const userPromptTemplate = config.userPromptTemplate as string | undefined;

  // ── Guard: no prompts configured → fallback immediately ──
  if (!systemPrompt || !userPromptTemplate) {
    console.log(
      `[AI Task] No prompts configured for "${ctx.stepKey}" — using fallback "${fallbackKey}"`,
    );
    return buildFallbackResult(fallbackKey, fallbackData, ctx.input, {
      reason: 'no_prompts_configured',
      promptVersion,
    });
  }

  // ── Guard: no provider available → fallback ──────────────
  const provider = getProvider();
  if (!provider) {
    console.log(
      `[AI Task] Provider unavailable for "${ctx.stepKey}" — using fallback "${fallbackKey}"`,
    );
    return buildFallbackResult(fallbackKey, fallbackData, ctx.input, {
      reason: 'provider_unavailable',
      error: _providerError || 'No API key',
      promptVersion,
    });
  }

  // ── Build AI request ─────────────────────────────────────
  const userPrompt = interpolateTemplate(userPromptTemplate, ctx.input);

  const request: AiRequest = {
    systemPrompt,
    userPrompt,
    outputSchema,
    model,
    timeoutMs,
    promptVersion,
  };

  // ── Attempt 1: call provider ─────────────────────────────
  let response: AiResponse;
  try {
    response = await provider.complete(request);
  } catch (err: any) {
    // Parse error → repair attempt
    if (err instanceof AiParseError) {
      console.warn(
        `[AI Task] Parse error on attempt 1 for "${ctx.stepKey}", trying repair...`,
      );
      const repairResult = await attemptRepair(
        provider,
        request,
        err.rawText,
        err.message,
      );
      if (repairResult) {
        response = repairResult;
      } else {
        return buildFallbackResult(fallbackKey, fallbackData, ctx.input, {
          reason: 'parse_error_after_repair',
          error: err.message,
          promptVersion,
          model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
        });
      }
    } else {
      // Provider error (timeout, network, rate limit) → fallback
      console.error(
        `[AI Task] Provider error for "${ctx.stepKey}": ${err.message}`,
      );
      return buildFallbackResult(fallbackKey, fallbackData, ctx.input, {
        reason: 'provider_error',
        error: err.message,
        promptVersion,
        model: model || process.env.OPENAI_MODEL || 'gpt-4o-mini',
      });
    }
  }

  // ── Validate output against schema ───────────────────────
  if (outputSchema) {
    const validation = validateOutputSchema(response.data, outputSchema);
    if (!validation.valid) {
      console.warn(
        `[AI Task] Schema validation failed for "${ctx.stepKey}": ${validation.errors.join(', ')}`,
      );

      // Repair attempt: re-prompt with validation errors
      const repairResult = await attemptRepair(
        provider,
        request,
        response.rawText,
        `Schema validation failed: ${validation.errors.join('; ')}`,
      );

      if (repairResult) {
        // Re-validate repair result
        const revalidation = validateOutputSchema(repairResult.data, outputSchema);
        if (revalidation.valid) {
          response = repairResult;
        } else {
          console.warn(
            `[AI Task] Repair also failed validation for "${ctx.stepKey}": ${revalidation.errors.join(', ')}`,
          );
          return buildFallbackResult(fallbackKey, fallbackData, ctx.input, {
            reason: 'schema_validation_failed_after_repair',
            validationErrors: revalidation.errors,
            ...response.meta,
          });
        }
      } else {
        return buildFallbackResult(fallbackKey, fallbackData, ctx.input, {
          reason: 'schema_validation_failed',
          validationErrors: validation.errors,
          ...response.meta,
        });
      }
    }
  }

  // ── Success: return AI output with full metadata ─────────
  console.log(
    `[AI Task] "${ctx.stepKey}" completed: model=${response.meta.model}, ` +
    `tokens=${response.meta.totalTokens}, latency=${response.meta.latencyMs}ms`,
  );

  return {
    output: {
      aiGenerated: true,
      data: response.data,
      meta: response.meta,
    },
  };
}

// ─── Repair attempt ───────────────────────────────────────────

async function attemptRepair(
  provider: AiProvider,
  originalRequest: AiRequest,
  previousOutput: string,
  errorMessage: string,
): Promise<AiResponse | null> {
  try {
    const repairRequest: AiRequest = {
      ...originalRequest,
      userPrompt:
        originalRequest.userPrompt +
        '\n\n--- REPAIR ---\n' +
        `Your previous response was invalid: ${errorMessage}\n` +
        `Previous output: ${previousOutput.substring(0, 500)}\n` +
        'Please fix your response and return ONLY a valid JSON object matching the schema.',
      promptVersion: `${originalRequest.promptVersion}-repair`,
      timeoutMs: originalRequest.timeoutMs || 15_000,
    };

    const response = await provider.complete(repairRequest);
    console.log(
      `[AI Task] Repair attempt succeeded: tokens=${response.meta.totalTokens}`,
    );
    return response;
  } catch (err: any) {
    console.warn(`[AI Task] Repair attempt failed: ${err.message}`);
    return null;
  }
}

// ─── Fallback builder ─────────────────────────────────────────

function buildFallbackResult(
  fallbackKey: string,
  fallbackData: Record<string, unknown>,
  input: Record<string, unknown>,
  meta: Record<string, unknown>,
): StepResult {
  console.log(`[AI Task] Fallback "${fallbackKey}" activated`);

  let data: Record<string, unknown>;

  switch (fallbackKey) {
    case 'use_default_template':
      // Return fallbackData merged with input keys
      data = { ...fallbackData, inputKeys: Object.keys(input) };
      break;
    case 'passthrough':
      // Just pass input through
      data = input;
      break;
    default:
      data = { ...fallbackData };
      break;
  }

  return {
    output: {
      aiGenerated: false,
      fallbackUsed: true,
      fallback: fallbackKey,
      data,
      meta,
    },
  };
}
