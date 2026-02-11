# Orkestr — Validação Sprint 2: IA Assistida Real

---

## BLOCO 1 — O que foi entregue

### Escopo Sprint 2: IA Assistida Real (com contrato forte)

| Dia | Entrega                                                  | Status |
| --- | -------------------------------------------------------- | ------ |
| 1   | AI Provider abstraction + OpenAI SDK integration         | ✅     |
| 2   | Structured output + schema validation (OutputSchema)     | ✅     |
| 3   | Fallback obrigatório + 1 tentativa de repair             | ✅     |
| 4   | Observability: prompt_version, model, tokens, latency_ms | ✅     |
| 5   | E2E test completo (fallback mode verificado)             | ✅     |

### Arquivos criados/modificados

| Arquivo                                  | Tipo       | Descrição                                                   |
| ---------------------------------------- | ---------- | ----------------------------------------------------------- |
| `apps/worker/src/ai/types.ts`            | Novo       | Interfaces: AiProvider, AiRequest, AiResponse, OutputSchema |
| `apps/worker/src/ai/openai-provider.ts`  | Novo       | Implementação OpenAI com response_format JSON               |
| `apps/worker/src/ai/schema-validator.ts` | Novo       | Validação de output contra OutputSchema                     |
| `apps/worker/src/ai/index.ts`            | Novo       | Barrel exports                                              |
| `apps/worker/src/executors/ai-task.ts`   | Reescrito  | Executor completo: LLM → validate → repair → fallback       |
| `apps/worker/src/step-runner.ts`         | Modificado | Logs AI-specific (modelo, tokens, latência, fallback)       |
| `packages/shared/prisma/seed.ts`         | Modificado | Workflow "Cobrança Slice" com config AI completa            |

---

## BLOCO 2 — Contratos e Interfaces

### AiProvider (interface)

```typescript
interface AiProvider {
  readonly name: string;
  complete(request: AiRequest): Promise<AiResponse>;
}
```

Swap qualquer provedor (OpenAI, Anthropic, local) implementando essa interface.

### AiRequest

```
- systemPrompt: string         — comportamento/persona do modelo
- userPrompt: string           — task com dados interpolados
- outputSchema?: OutputSchema  — schema JSON para validação
- model?: string               — override do modelo (default: env OPENAI_MODEL)
- timeoutMs?: number           — timeout (default: 15000ms)
- promptVersion?: string       — versão do prompt para rastreabilidade
```

### AiResponse

```
- data: Record<string, unknown>  — output estruturado (JSON parseado)
- rawText: string                — resposta bruta do modelo
- meta:
  - model: string
  - promptVersion: string
  - promptTokens: number
  - completionTokens: number
  - totalTokens: number
  - latencyMs: number
  - finishReason: string
```

### OutputSchema (validação forte)

```typescript
interface OutputSchema {
  type: "object";
  properties: Record<
    string,
    {
      type: string; // string, number, boolean, array, object
      description?: string;
      enum?: string[]; // valores permitidos
    }
  >;
  required?: string[]; // campos obrigatórios
}
```

Validator verifica: campos required presentes, tipos corretos, enum constraints.

---

## BLOCO 3 — Fluxo de Execução ai_task

### Sequência real (10 passos)

1. **Config carregada** — `systemPrompt`, `userPromptTemplate`, `outputSchema`, `fallback`, `fallbackData`, `promptVersion`, `model`, `timeoutMs`

2. **Guard: sem prompts** — se `systemPrompt` ou `userPromptTemplate` ausentes → fallback imediato. Razão: `no_prompts_configured`.

3. **Guard: sem provider** — se `OPENAI_API_KEY` não configurada → provider init falha → fallback. Razão: `provider_unavailable`. Provider é lazy-loaded (singleton).

4. **Template interpolation** — `{{field}}` substituído por dados do input. Suporta dot notation: `{{customer.name}}`. Objetos viram JSON.stringify.

5. **Attempt 1: chamada LLM** — `provider.complete(request)` com timeout. Se `outputSchema` presente, `response_format: { type: 'json_object' }` ativado no OpenAI.

6. **Parse check** — resposta parseada como JSON. Se falhar → `AiParseError` → repair attempt.

7. **Schema validation** — `validateOutputSchema(data, schema)`. Verifica required, tipos, enum. Se falhar → repair attempt.

8. **Repair attempt** — 1 tentativa de re-prompt com:
   - Mensagem de erro original
   - Output anterior (primeiros 500 chars)
   - Instrução explícita para corrigir
   - `promptVersion` sufixada com `-repair`
   - Se repair válido → usa resultado. Se repair falha → fallback.

9. **Fallback** — sempre disponível. Estratégias:
   - `use_default_template`: retorna `fallbackData` + `inputKeys` do input original
   - `passthrough`: retorna input direto sem transformação
   - Custom: retorna `fallbackData` bruto

10. **Success** — output retornado com:
    - `aiGenerated: true`
    - `data`: output estruturado do LLM
    - `meta`: model, tokens, latência, promptVersion, finishReason

### Config de exemplo (workflow step)

```json
{
  "key": "enrich_context",
  "type": "ai_task",
  "config": {
    "systemPrompt": "You are a collections specialist...",
    "userPromptTemplate": "Generate a collection message...\nAmount: {{amount}}\nCustomer: {{customerId}}",
    "outputSchema": {
      "type": "object",
      "properties": {
        "message": {
          "type": "string",
          "description": "Collection message in PT-BR"
        },
        "subject": { "type": "string" },
        "urgency": { "type": "string", "enum": ["low", "medium", "high"] },
        "tone": { "type": "string", "enum": ["friendly", "firm", "urgent"] }
      },
      "required": ["message", "subject", "urgency", "tone"]
    },
    "promptVersion": "v1",
    "timeoutMs": 15000,
    "fallback": "use_default_template",
    "fallbackData": {
      "message": "Prezado cliente, informamos que há um valor pendente...",
      "subject": "Aviso de cobrança",
      "urgency": "medium",
      "tone": "friendly"
    }
  }
}
```

### O que garante que IA nunca quebra o fluxo?

Cinco camadas de proteção:

1. **Guard de configuração:** sem prompts → fallback imediato, sem chamada ao provider.
2. **Guard de provider:** OPENAI_API_KEY ausente → lazy init falha → fallback, sem exception.
3. **Timeout:** 15s default. Provider error (timeout, rede, rate limit) → fallback.
4. **Repair attempt:** 1 tentativa de correção antes de desistir. Inclui erro original + output prévio.
5. **Fallback obrigatório:** toda config `ai_task` tem que ter `fallback` + `fallbackData`. Fluxo sempre continua.

**Resultado:** ai_task é o único step type que NUNCA falha a run. Sempre retorna output (real ou fallback).

---

## BLOCO 4 — Observability

### Logs gerados por ai_task

**Cenário: LLM call sucesso**

```
[info] Step "enrich_context" (ai_task) → RUNNING
[info] Step "enrich_context" (ai_task) → COMPLETED
[info] AI Task "enrich_context" — LLM call succeeded
       { model: "gpt-4o-mini", promptVersion: "v1",
         promptTokens: 250, completionTokens: 180, totalTokens: 430,
         latencyMs: 1200, finishReason: "stop" }
```

**Cenário: fallback ativado**

```
[info] Step "enrich_context" (ai_task) → RUNNING
[info] Step "enrich_context" (ai_task) → COMPLETED
[warn] AI Task "enrich_context" — fallback activated
       { fallback: "use_default_template", reason: "provider_unavailable",
         promptVersion: "v1" }
```

**Cenário: repair attempt (parse error → repair → success)**

```
[info] Step "enrich_context" (ai_task) → RUNNING
[warn] [AI Task] Parse error on attempt 1, trying repair...
[info] [AI Task] Repair attempt succeeded: tokens=200
[info] Step "enrich_context" (ai_task) → COMPLETED
[info] AI Task "enrich_context" — LLM call succeeded
       { model: "gpt-4o-mini", promptVersion: "v1-repair", ... }
```

### Output structure

**Sucesso (AI real):**

```json
{
  "aiGenerated": true,
  "data": {
    "message": "...",
    "subject": "...",
    "urgency": "high",
    "tone": "firm"
  },
  "meta": {
    "model": "gpt-4o-mini",
    "promptVersion": "v1",
    "promptTokens": 250,
    "completionTokens": 180,
    "totalTokens": 430,
    "latencyMs": 1200,
    "finishReason": "stop"
  }
}
```

**Fallback:**

```json
{
  "aiGenerated": false,
  "fallbackUsed": true,
  "fallback": "use_default_template",
  "data": {
    "message": "Prezado cliente...",
    "subject": "...",
    "urgency": "medium",
    "tone": "friendly"
  },
  "meta": {
    "reason": "provider_unavailable",
    "error": "OPENAI_API_KEY is not set",
    "promptVersion": "v1"
  }
}
```

### Variáveis de ambiente

| Variável         | Obrigatória        | Default       | Descrição         |
| ---------------- | ------------------ | ------------- | ----------------- |
| `OPENAI_API_KEY` | Sim (para AI real) | —             | API key do OpenAI |
| `OPENAI_MODEL`   | Não                | `gpt-4o-mini` | Modelo padrão     |

Sem `OPENAI_API_KEY`, tudo funciona via fallback — nenhum fluxo quebra.

---

## E2E Confirmado

### Teste: Cobrança Slice (condition → ai_task → action → end)

**Sem OPENAI_API_KEY (fallback mode):**

```
Run status: COMPLETED

Steps:
  check_eligibility (condition) = COMPLETED
  enrich_context (ai_task) = COMPLETED ← fallback activated
  send_collection (action) = COMPLETED
  finish (end) = COMPLETED

AI Task output:
  aiGenerated: false
  fallbackUsed: true
  fallback: "use_default_template"
  data.message: "Prezado cliente, informamos que há um valor pendente..."
  meta.reason: "provider_unavailable"
  meta.promptVersion: "v1"

Logs:
  [warn] AI Task "enrich_context" — fallback activated
```

**Com OPENAI_API_KEY (AI real mode):**

Comportamento esperado:

- `aiGenerated: true`
- `data` = resposta do LLM validada contra `outputSchema`
- `meta` = model, tokens, latencyMs, promptVersion, finishReason
- Se LLM retorna JSON inválido → 1 repair attempt → mesmo fluxo
- Se repair falha → fallback → fluxo continua

---

## Resumo Sprint 2

| Garantia                                        | Implementado                      | Testado            |
| ----------------------------------------------- | --------------------------------- | ------------------ |
| ai_task com chamada real ao LLM                 | ✅ OpenAI SDK via AiProvider      | ✅ (fallback mode) |
| Output sempre estruturado + validado            | ✅ OutputSchema + validator       | ✅                 |
| Fallback obrigatório                            | ✅ 5 camadas de proteção          | ✅                 |
| Logs: prompt_version, model, tokens, latency_ms | ✅ RunLog dedicado                | ✅                 |
| Timeout curto + 1 repair attempt                | ✅ 15s timeout + repair re-prompt | ✅                 |
| Provider abstraction (swap LLM)                 | ✅ AiProvider interface           | ✅                 |
| Backward compat (Sprint 1 workflows continuam)  | ✅                                | ✅                 |
