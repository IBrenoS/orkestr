/**
 * Orkestr — AI Provider Types (Sprint 2)
 *
 * Contract for any LLM provider. The executor depends on these
 * interfaces, never on a specific SDK.
 */

/** Schema definition for structured output validation */
export interface OutputSchema {
  /** JSON Schema-compatible type definition */
  type: 'object';
  properties: Record<string, { type: string; description?: string; enum?: string[] }>;
  required?: string[];
}

/** What the executor sends to the provider */
export interface AiRequest {
  /** System prompt — defines behavior/persona */
  systemPrompt: string;
  /** User prompt — the actual task with interpolated data */
  userPrompt: string;
  /** Expected output schema for structured responses */
  outputSchema?: OutputSchema;
  /** Model override (default from env) */
  model?: string;
  /** Timeout in ms (default: 15000) */
  timeoutMs?: number;
  /** Prompt version for traceability */
  promptVersion?: string;
}

/** What the provider returns */
export interface AiResponse {
  /** Parsed structured output (JSON object) */
  data: Record<string, unknown>;
  /** Raw text response from the model */
  rawText: string;
  /** Provider metadata for observability */
  meta: AiResponseMeta;
}

/** Observability metadata logged per call */
export interface AiResponseMeta {
  model: string;
  promptVersion: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  latencyMs: number;
  finishReason: string;
}

/** Provider interface — swap OpenAI for any other LLM */
export interface AiProvider {
  /** Unique provider identifier */
  readonly name: string;
  /** Execute an AI request and return structured response */
  complete(request: AiRequest): Promise<AiResponse>;
}
