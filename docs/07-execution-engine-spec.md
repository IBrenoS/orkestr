# Orkestr — Execution Engine Specification

## Missão
Executar fluxos definidos com rastreabilidade total e falhas controladas.

## Entidades
- Event
- Workflow
- Run
- Step Run

## Tipos de Nó
- condition
- action
- delay
- ai_task
- end

## Garantias
- Idempotência
- Retry controlado
- DLQ visível
- Logs obrigatórios
