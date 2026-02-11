/**
 * Orkestr — OpenAI Provider (Sprint 2)
 *
 * Implements AiProvider using the OpenAI SDK.
 * Supports structured JSON output via response_format.
 * Configurable via environment variables.
 */
import OpenAI from 'openai';
import { AiProvider, AiRequest, AiResponse } from './types';

export class OpenAiProvider implements AiProvider {
  readonly name = 'openai';
  private readonly client: OpenAI;
  private readonly defaultModel: string;

  constructor() {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error(
        'OPENAI_API_KEY is not set. AI tasks require a valid OpenAI API key.',
      );
    }

    this.client = new OpenAI({ apiKey });
    this.defaultModel = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  }

  async complete(request: AiRequest): Promise<AiResponse> {
    const model = request.model || this.defaultModel;
    const timeoutMs = request.timeoutMs || 15_000;
    const promptVersion = request.promptVersion || 'v1';

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: request.systemPrompt },
      { role: 'user', content: request.userPrompt },
    ];

    // If schema is provided, instruct model to return JSON
    if (request.outputSchema) {
      messages[0] = {
        role: 'system',
        content:
          request.systemPrompt +
          '\n\nYou MUST respond with a valid JSON object matching this schema:\n' +
          JSON.stringify(request.outputSchema, null, 2) +
          '\n\nDo NOT include any text outside the JSON object.',
      };
    }

    const start = Date.now();

    const completion = await this.client.chat.completions.create(
      {
        model,
        messages,
        temperature: 0.3,
        max_tokens: 1024,
        ...(request.outputSchema
          ? { response_format: { type: 'json_object' as const } }
          : {}),
      },
      { timeout: timeoutMs },
    );

    const latencyMs = Date.now() - start;
    const choice = completion.choices[0];
    const rawText = choice?.message?.content?.trim() || '';

    // Parse JSON response
    let data: Record<string, unknown>;
    try {
      data = JSON.parse(rawText);
    } catch {
      throw new AiParseError(
        `Failed to parse AI response as JSON: ${rawText.substring(0, 200)}`,
        rawText,
      );
    }

    return {
      data,
      rawText,
      meta: {
        model: completion.model,
        promptVersion,
        promptTokens: completion.usage?.prompt_tokens ?? 0,
        completionTokens: completion.usage?.completion_tokens ?? 0,
        totalTokens: completion.usage?.total_tokens ?? 0,
        latencyMs,
        finishReason: choice?.finish_reason || 'unknown',
      },
    };
  }
}

/** Specific error for AI response parsing failures — triggers repair attempt */
export class AiParseError extends Error {
  constructor(
    message: string,
    public readonly rawText: string,
  ) {
    super(message);
    this.name = 'AiParseError';
  }
}
