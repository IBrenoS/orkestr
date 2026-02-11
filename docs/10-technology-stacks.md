# Orkestr — Stack de Tecnologias (Visão de Engenharia)

## Objetivo deste Documento
Definir a stack tecnológica oficial do Orkestr para o MVP, alinhada aos princípios do produto:
- determinismo
- auditabilidade
- confiabilidade
- evolução controlada
- baixo atrito operacional

Esta stack não define o produto, mas **viabiliza sua execução correta**.

---

## Princípios que guiaram a escolha da stack

A stack do Orkestr foi escolhida com base nos seguintes critérios:

- Clareza de responsabilidades
- Forte suporte a concorrência e filas
- Observabilidade madura
- Facilidade de evolução incremental
- Consistência de linguagem e tipos
- Ecossistema estável para produtos de longa vida

Nenhuma tecnologia foi escolhida por hype.

---

## Visão Geral da Stack

### Linguagem principal
- **TypeScript**

**Justificativa**
- Tipagem forte para contratos explícitos
- Redução de ambiguidade entre módulos
- Compartilhamento de modelos e schemas
- Menor fricção entre API, workers e IA

---

## Backend (API Principal)

- **Node.js**
- **NestJS**

**Responsabilidades**
- autenticação e multi-tenant
- ingestão de eventos
- gerenciamento de workflows
- criação de runs e steps
- exposição de APIs administrativas

**Justificativa**
- Arquitetura modular
- Dependency Injection madura
- Validação e pipes explícitos
- Excelente suporte a aplicações empresariais

---

## Execution Engine & Workers

- **Node.js (TypeScript)**
- **BullMQ** (fila de jobs)
- **Redis**

**Responsabilidades**
- execução de steps
- controle de estado
- retries e backoff
- DLQ
- agendamento de delays

**Justificativa**
- BullMQ é estável, previsível e observável
- Redis é adequado para coordenação e locks
- Separação clara entre API e execução

---

## Banco de Dados

- **PostgreSQL (puro)**

**Uso**
- fonte de verdade do sistema
- eventos, runs, step_runs, logs
- workflows versionados
- auditoria completa

**Justificativa**
- Confiabilidade comprovada
- Suporte robusto a transações
- JSONB para flexibilidade controlada
- Ideal para sistemas auditáveis

---

## ORM / Migrations

- **Prisma** *(ou Drizzle, como alternativa)*

**Justificativa**
- Tipagem consistente com TypeScript
- Migrations claras
- Facilita evolução controlada do schema

---

## Camada de IA (Assistida)

- **TypeScript**
- **SDK de LLM (OpenAI / Anthropic / equivalente)**

**Uso**
- classificação
- extração
- geração de mensagens

**Características**
- prompts versionados
- outputs validados por schema
- fallback determinístico
- logs de custo e latência

**Justificativa**
- IA integrada como módulo, não como sistema autônomo
- Evita duplicação de stacks (TS + Python) no MVP
- Reduz fricção inicial

---

## Frontend (MVP e evolução)

### MVP
- UI mínima (admin / inspeção)
- Pode ser:
  - **Next.js**
  - ou interface simples para visualização de runs

### Evolução
- **Next.js + React**
- **Tailwind / shadcn-ui**
- **React Flow** (quando o builder visual entrar)

**Justificativa**
- Frontend não é prioridade no MVP
- UI evolui depois que o engine está sólido

---

## Observabilidade

- Logs estruturados no PostgreSQL
- Logs de execução por run e step
- (Evolução futura)
  - OpenTelemetry
  - Sentry
  - Métricas de fila

**Justificativa**
- Observabilidade é parte do produto, não acessório

---

## Infraestrutura (neutra e flexível)

- Docker
- Ambiente gerenciado (Render / Fly.io / ECS / similar)
- Redis gerenciado
- Postgres gerenciado

**Justificativa**
- Infra não interfere na arquitetura
- Fácil replicar ambientes
- Sem dependência de fornecedor específico

---

## Decisão Consciente Importante

O Orkestr **não** começa com:
- microserviços
- múltiplas linguagens
- event sourcing complexo
- pipelines de ML

Essas decisões só entram **quando o produto exigir**, não antes.

---

## Conclusão

A stack do Orkestr foi escolhida para:

- validar o coração do produto cedo
- reduzir atrito de desenvolvimento
- garantir confiabilidade operacional
- permitir evolução sem retrabalho

Ela serve ao produto —  
o produto não serve à stack.

---

## Status do Documento
✔️ Stack oficial definida  
✔️ Alinhada com visão e MVP  
✔️ Pronta para execução  

