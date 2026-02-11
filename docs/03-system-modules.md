# Orkestr — Mapa de Módulos do Sistema

## Módulos Centrais
1. Identity & Tenant
2. Integration Hub
3. Event Ingestion
4. Workflow Studio
5. Execution Engine
6. AI Assist Layer
7. Audit & Observability

## Responsabilidade-Chave
Cada módulo possui fronteiras claras e não sobrepostas.

## Regra de Ouro
Execução é determinística.  
IA apenas enriquece contexto.  
Auditoria é obrigatória.

## Cadeia de Execução
Evento → Normalização → Seleção de Fluxo → Execução → Registro → Monitoramento
