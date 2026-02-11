# Orkestr — Validação Sprint 0 / Sprint 1

---

## BLOCO 1 — Estrutura do Projeto

### 1. Estrutura de pastas

```
orkestr/
├── apps/
│   ├── api/          # NestJS REST API (porta 3000)
│   └── worker/       # BullMQ consumer standalone (Node)
├── packages/
│   └── shared/       # Prisma schema, migrations, seed
├── docs/             # 10 documentos de referência do produto
├── docker-compose.yml
├── tsconfig.base.json
├── package.json      # npm workspaces root
└── .env
```

### 2. Stack confirmada

| Camada        | Tecnologia                          | Versão      |
| ------------- | ----------------------------------- | ----------- |
| Runtime       | Node.js + TypeScript                | ≥ 20 / 5.7  |
| API Framework | NestJS                              | 11          |
| ORM           | Prisma                              | 6.19        |
| Banco         | PostgreSQL                          | 16 (Docker) |
| Fila          | BullMQ                              | 5.x         |
| Broker        | Redis                               | 7 (Docker)  |
| Validação     | class-validator / class-transformer | 0.14 / 0.5  |
| Monorepo      | npm workspaces                      | nativo      |

### 3. Comunicação API → Worker

**Fila BullMQ** (queue `step-runs`, broker Redis).

Fluxo:

1. API cria `Run` + primeiro `StepRun` em transação Prisma.
2. API adiciona job `{ stepRunId }` na queue `step-runs` via `QueueService`.
3. Worker consome o job, executa o step, e adiciona o próximo job na mesma queue.
4. Não há comunicação direta API ↔ Worker. Todo estado é persistido no Postgres.

---

## BLOCO 2 — Modelos Implementados

### Event

```
- id            UUID (PK)
- tenant_id     UUID (FK → tenants)
- type          String ("invoice_overdue", "lead_created")
- payload       JSON
- source        String ("api", "webhook", "internal")
- external_id   String? (chave de dedup do caller)
- created_at    DateTime
```

**Idempotência:** constraint UNIQUE em `(tenant_id, source, external_id)`.
Se duplicado, retorna o evento existente com flag `_idempotent: true`.
Normalização: `type` → snake_case, `source` → lowercase trimmed.

### Workflow

```
- id            UUID (PK)
- tenant_id     UUID (FK → tenants)
- name          String
- description   String?
- trigger_type  String (tipo de evento que ativa)
- version       Int (default 1)
- is_active     Boolean
- published_at  DateTime? (após publicar, steps são imutáveis)
- steps         JSON (array de StepDefinition[])
- created_at    DateTime
- updated_at    DateTime
```

**Regras:**

- UNIQUE em `(tenant_id, name, version)`.
- Publicação exigida para criar runs. Uma vez publicado, re-publicação rejeitada (409).
- Validação de steps: tipos válidos, pelo menos 1 "end", primeiro step ≠ "end", keys únicas, mínimo 2 steps.

### Run

```
- id              UUID (PK)
- workflow_id     UUID (FK → workflows)
- event_id        UUID (FK → events)
- status          Enum (PENDING | RUNNING | COMPLETED | FAILED | CANCELLED)
- dispatch_status String (PENDING | DISPATCHED | FAILED)
- context         JSON (dados acumulados em runtime)
- error           String? (mensagem de erro se FAILED)
- started_at      DateTime?
- finished_at     DateTime?
- created_at      DateTime
- updated_at      DateTime
```

**dispatch_status:** rastreia se o job foi entregue à fila com sucesso. Se Redis falhar no dispatch, run é marcada como `FAILED` com `dispatch_status=FAILED` e error log explícito — nenhuma run fica órfã/invisível.

### StepRun

```
- id            UUID (PK)
- run_id        UUID (FK → runs)
- step_key      String (referência ao step no workflow.steps)
- step_type     String (condition | action | ai_task | delay | end)
- status        Enum (PENDING | RUNNING | COMPLETED | FAILED | SKIPPED | RETRYING)
- input         JSON (payload do evento)
- output        JSON (resultado da execução)
- error         String?
- provider_ref  String? (referência externa — idempotência de actions)
- attempt       Int (default 1, incrementa em retry)
- started_at    DateTime?
- finished_at   DateTime?
- created_at    DateTime
- updated_at    DateTime
```

**Idempotência de action (3 camadas):**

1. **Persist-before-execute:** antes de chamar o serviço externo, o StepRunner salva `provider_ref = intent-{stepRunId}-attempt-{N}` no banco. Se o worker crashar entre a execução e o commit final, o `provider_ref` já existe e impede re-execução.
2. **Verificação na entrada:** ao re-processar um step, o StepRunner verifica se `provider_ref` já existe — se sim, pula a execução e avança o fluxo.
3. **Dedup externo:** header `X-Idempotency-Key: stepRunId` enviado em webhooks para dedup do lado do receptor.

### RunLog

```
- id            UUID (PK)
- run_id        UUID (FK → runs)
- level         String (info | warn | error)
- message       String
- context       JSON (stepKey, stepRunId, dados extras)
- created_at    DateTime
```

### AuditLog

```
- id            UUID (PK)
- entity        String ("event", "run", "step_run", "workflow", "seed")
- entity_id     UUID
- action        String ("created", "status_changed", "published", "failed")
- details       JSON
- created_at    DateTime
```

---

## BLOCO 3 — Fluxo Real Executando

### Cenário: evento `invoice_overdue` com `amount: 2500`

**Workflow "Sprint 1 Test":** `check_overdue (condition, rule: { field: "amount", operator: "greater_than", value: 100 })` → `notify (action, dry-run)` → `done (end)`

#### Passo a passo

1. **POST /api/events** — API recebe o evento, normaliza type/source, verifica idempotência por `(tenant_id, source, external_id)`, persiste.

2. **POST /api/runs** — API valida que o workflow está publicado (`published_at ≠ null`). Em transação atômica:
   - Cria `Run` (status=PENDING)
   - Cria primeiro `StepRun` `check_overdue` (status=PENDING, input=event.payload)
   - Grava 2 `RunLog` (run created, step created)
   - Grava 2 `AuditLog`

3. **API → Queue** — `QueueService.dispatchStep(stepRunId, "condition")` adiciona job `{ stepRunId }` na queue `step-runs`. Condition = 1 attempt, sem retry. Se dispatch falhar (Redis indisponível), run é marcada como `FAILED` com `dispatch_status=FAILED` e error log. Se sucesso, `dispatch_status=DISPATCHED`.

4. **Worker consome job** — `StepRunner.process(stepRunId)`:
   - Carrega stepRun + run + workflow + event
   - Run PENDING → RUNNING (`started_at` setado)
   - StepRun PENDING → RUNNING
   - Log: `Step "check_overdue" (condition) → RUNNING`

5. **Condition avaliada** — DSL determinístico: `{ field: "amount", operator: "greater_than", value: 100 }` aplicado sobre `{ amount: 2500 }` → `true`.
   - Sem `vm.runInNewContext`, sem eval, sem sandbox — avaliação puramente estrutural.
   - Suporta operadores tipados: `equals`, `gt`, `gte`, `lt`, `lte`, `contains`, `in`, `exists`, etc.
   - Suporta composição: `{ and: [...] }` e `{ or: [...] }` com profundidade arbitrária.
   - Suporta dot notation: `customer.address.city`.
   - StepRun → COMPLETED, output: `{ result: true, rule: { field: "amount", operator: "greater_than", value: 100 } }`
   - Log: `Step "check_overdue" (condition) → COMPLETED`
   - Como `result=true`, avança linearmente para o próximo step.

6. **Próximo step criado** — StepRunner cria `StepRun` `notify` (action, PENDING, input=event.payload). Dispatcha job com 3 attempts + exponential backoff.
   - Log: `Step "notify" (action) created as PENDING`

7. **Action executada** — persist-before-execute: `provider_ref = intent-{stepRunId}-attempt-1` salvo **antes** da chamada externa.
   - Log: `Action "notify" intent persisted before execution`
   - Sem URL configurada → dry-run (log-only).
   - StepRun → COMPLETED, output: `{ dryRun: true, actionType: "webhook" }`
   - `provider_ref` atualizado para `dry-run-<uuid>` (referência real do provider).
   - Log: `Step "notify" (action) → COMPLETED` com providerRef.

8. **End step criado e executado** — `done` (end) criado → RUNNING → COMPLETED.
   - Run → COMPLETED, `finished_at` setado.
   - Log: `Run completed successfully`

**Duração total medida em testes:** ~200ms para 3 steps.

#### Se condition=false (amount=50):

- DSL `{ field: "amount", operator: "greater_than", value: 100 }` sobre `{ amount: 50 }` → `false`
- `config.onFalse = "done"` → rota diretamente para step `done` (end), **pulando action**.
- Log: `Condition routed: "check_overdue" → "done" (branch: false)`
- Apenas 2 steps executados (condition + end). Fluxo encerra normalmente como COMPLETED.

### Onde o retry acontece?

No **BullMQ**, configurado por job. Actions recebem `attempts: 3, backoff: { type: "exponential", delay: 1000 }` (1s → 2s → 4s). Conditions e end recebem `attempts: 1` (sem retry).

Entre tentativas, o Worker marca o step como `RETRYING` e grava um warn log: `Step "X" failed (attempt 1/3), will retry: <erro>`.

### Onde o DLQ acontece?

Quando o BullMQ esgota todas as tentativas (`job.attemptsMade >= maxAttempts`), o evento `failed` do Worker chama `StepRunner.handleFailure()`:

- StepRun → FAILED (com error e attempt final)
- Run → FAILED (com mensagem: `Step "X" failed after N attempt(s): <erro>`)
- 2 error logs: um para o step, um para o run

Runs falhas são listadas em `GET /api/runs/failed` com error logs e detalhes dos steps.

### O que impede duplicação?

Quatro camadas:

1. **Eventos:** constraint UNIQUE `(tenant_id, source, external_id)` — mesmo evento não é registrado duas vezes.
2. **Persist-before-execute:** `provider_ref = intent-{stepRunId}-attempt-{N}` salvo **antes** de chamar o serviço externo. Se worker crashar entre execução e commit, o intent já está persistido.
3. **Verificação na entrada:** ao re-processar um step, verifica se `provider_ref` já existe — se sim, pula execução e avança o fluxo.
4. **Dedup externo:** header `X-Idempotency-Key: stepRunId` enviado em webhooks — permite dedup do lado do receptor.

---

## BLOCO 4 — Testes de Falha

### O que acontece se SMTP falha?

**Não se aplica diretamente.** O Sprint 1 implementa Actions como webhook ou dry-run. Não há integração SMTP real. Se um webhook falha (HTTP erro ou connection refused):

- BullMQ retenta 3 vezes com backoff exponencial (1s, 2s, 4s).
- Entre tentativas, step fica como RETRYING com warn log.
- Após 3 falhas, step → FAILED, run → FAILED, com error logs explicando o motivo.
- **Testado e verificado:** workflow com URL `http://localhost:19999/does-not-exist` → 3 tentativas → FAILED. Logs: 2 warns (attempt 1/3, 2/3) + 2 errors (step failed, run failed).

### O que acontece se Redis cair?

**Impacto controlado via `dispatch_status`:**

- API tenta adicionar job na queue após criar Run em transação Prisma.
- Se dispatch falhar: run é marcada como `status=FAILED`, `dispatch_status=FAILED`, `error="Dispatch to queue failed: <motivo>"`, com error log explícito. **Nenhuma run fica órfã ou invisível.**
- Se dispatch funcionar: `dispatch_status=DISPATCHED`.
- Worker para de receber novos jobs. Steps em voo (RUNNING) completam normalmente porque a execução já não depende de Redis.
- **Recuperação:** ao reiniciar Redis, Worker reconecta automaticamente (IORedis `maxRetriesPerRequest: null`). Jobs pendentes no Redis persistem (volume Docker).
- **Não testado com kill do container durante processamento ativo.** Mitigação futura: polling de runs com `dispatch_status=FAILED` para re-dispatch.

### O que acontece se o Worker morrer no meio?

**Impacto controlado via persist-before-execute:**

- O step_run que estava sendo processado fica com status `RUNNING` no banco.
- BullMQ considera o job como "stalled" após o timeout de stall detection (padrão: 30s).
- **Recuperação:** ao reiniciar o Worker, BullMQ reprocessa jobs stalled automaticamente.
- **Para actions:** o `provider_ref` (intent) é salvo **antes** de chamar o serviço externo. Se o worker crashar após a execução mas antes do commit final, o `provider_ref` já existe → re-processamento detecta e pula a execução. Sem duplicação.
- **Cenário residual não coberto:** crash entre `RUNNING` e o persist do intent (janela de ~1ms). Risco aceitável no MVP. Mitigação futura: outbox pattern.
- **Não testado com kill do processo.** O padrão persist-before-execute cobre o cenário crítico (crash entre execução e commit), mas o teste manual de kill não foi realizado.

### O que acontece se IA falhar?

**Não se aplica no Sprint 1.** O executor `ai_task` usa fallback obrigatório (passthrough — repassa o input como output). Não há chamada real a nenhum serviço de IA. O step sempre completa com `{ fallbackUsed: true, fallback: "use_default_template", data: <input> }`.

Integração real com IA está planejada para Sprint 2+. Quando implementada, o padrão já existe: `config.fallback` define o comportamento alternativo, e o step será tratado como qualquer outro (retry se transitório, fail se terminal).
