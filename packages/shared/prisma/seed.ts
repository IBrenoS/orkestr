/**
 * Orkestr — Sprint 0 + Sprint 1 + Sprint 2 Seed
 *
 * Creates:
 *  - Demo tenant "Acme Corp"
 *  - "Cobrança Slice" workflow (condition → ai_task → action → end) — with AI config
 *  - "Sprint 1 Test" workflow (condition → action → end)
 *
 * Usage: npx ts-node prisma/seed.ts
 * Requires: DATABASE_URL env var
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const COBRANCA_STEPS = [
  {
    key: 'check_eligibility',
    type: 'condition',
    config: {
      description: 'Verifica se o cliente é elegível para cobrança',
      rule: { field: 'amount', operator: 'greater_than', value: 0 },
    },
  },
  {
    key: 'enrich_context',
    type: 'ai_task',
    config: {
      description: 'Gera mensagem de cobrança personalizada usando IA',
      systemPrompt:
        'You are a collections specialist for a financial company. ' +
        'Generate a polite but firm collection message in Portuguese (BR). ' +
        'Always be professional and empathetic.',
      userPromptTemplate:
        'Generate a collection message for a customer with an overdue invoice.\n' +
        'Customer ID: {{customerId}}\n' +
        'Amount due: R$ {{amount}}\n' +
        'Invoice details: {{invoiceId}}\n' +
        'Generate the message and classify the urgency.',
      outputSchema: {
        type: 'object',
        properties: {
          message: { type: 'string', description: 'The collection message in Portuguese' },
          subject: { type: 'string', description: 'Email subject line' },
          urgency: { type: 'string', description: 'Urgency level', enum: ['low', 'medium', 'high'] },
          tone: { type: 'string', description: 'Tone used', enum: ['friendly', 'firm', 'urgent'] },
        },
        required: ['message', 'subject', 'urgency', 'tone'],
      },
      promptVersion: 'v1',
      timeoutMs: 15000,
      fallback: 'use_default_template',
      fallbackData: {
        message: 'Prezado cliente, informamos que há um valor pendente em sua conta. Por favor, entre em contato.',
        subject: 'Aviso de cobrança',
        urgency: 'medium',
        tone: 'friendly',
      },
    },
  },
  {
    key: 'send_collection',
    type: 'action',
    config: {
      description: 'Envia mensagem de cobrança pelo canal definido',
      channel: 'email',
      templateKey: 'collection_default',
    },
  },
  {
    key: 'finish',
    type: 'end',
    config: {
      description: 'Encerra o fluxo de cobrança',
    },
  },
];

const SPRINT1_STEPS = [
  {
    key: 'check_overdue',
    type: 'condition',
    config: {
      description: 'Verifica se valor é positivo para cobrança',
      rule: { field: 'amount', operator: 'greater_than', value: 100 },
      onFalse: 'done',
    },
  },
  {
    key: 'notify',
    type: 'action',
    config: {
      description: 'Notificação via webhook (dry-run se sem URL)',
      type: 'webhook',
      url: process.env.ACTION_WEBHOOK_URL || null,
    },
  },
  {
    key: 'done',
    type: 'end',
    config: {
      description: 'Encerra o fluxo',
    },
  },
];

async function seed() {
  console.log('[Seed] Starting seed...');

  // 1. Create demo tenant (idempotent by slug)
  const tenant = await prisma.tenant.upsert({
    where: { slug: 'acme-demo' },
    update: {},
    create: {
      name: 'Acme Corp (Demo)',
      slug: 'acme-demo',
    },
  });
  console.log(`[Seed] Tenant: ${tenant.name} (${tenant.id})`);

  // 2. Upsert "Cobrança Slice" workflow (updates steps/rules if changed)
  const cobranca = await prisma.workflow.upsert({
    where: {
      tenantId_name_version: {
        tenantId: tenant.id,
        name: 'Cobrança Slice',
        version: 1,
      },
    },
    update: {
      steps: COBRANCA_STEPS,
    },
    create: {
      tenantId: tenant.id,
      name: 'Cobrança Slice',
      description:
        'Fluxo MVP de cobrança automatizada — condition → ai_task → action → end',
      triggerType: 'invoice_overdue',
      version: 1,
      isActive: true,
      publishedAt: new Date(),
      steps: COBRANCA_STEPS,
    },
  });

  // Ensure cobrança is published
  if (!cobranca.publishedAt) {
    await prisma.workflow.update({
      where: { id: cobranca.id },
      data: { publishedAt: new Date() },
    });
  }
  console.log(`[Seed] Workflow "Cobrança Slice": ${cobranca.id}`);

  // 3. Upsert Sprint 1 test workflow (condition → action → end)
  const sprint1 = await prisma.workflow.upsert({
    where: {
      tenantId_name_version: {
        tenantId: tenant.id,
        name: 'Sprint 1 Test',
        version: 1,
      },
    },
    update: {
      steps: SPRINT1_STEPS,
    },
    create: {
      tenantId: tenant.id,
      name: 'Sprint 1 Test',
      description:
        'Fluxo simples para validação Sprint 1 — condition → action → end',
      triggerType: 'invoice_overdue',
      version: 1,
      isActive: true,
      publishedAt: new Date(),
      steps: SPRINT1_STEPS,
    },
  });

  if (!sprint1.publishedAt) {
    await prisma.workflow.update({
      where: { id: sprint1.id },
      data: { publishedAt: new Date() },
    });
  }
  console.log(`[Seed] Workflow "Sprint 1 Test": ${sprint1.id}`);

  // 4. Audit
  await prisma.auditLog.create({
    data: {
      entity: 'seed',
      entityId: cobranca.id,
      action: 'seed_executed',
      details: {
        tenantId: tenant.id,
        workflows: [
          { name: cobranca.name, id: cobranca.id, steps: COBRANCA_STEPS.length },
          { name: sprint1.name, id: sprint1.id, steps: SPRINT1_STEPS.length },
        ],
      },
    },
  });

  console.log('\n[Seed] Complete:');
  console.log(`  Tenant ID:            ${tenant.id}`);
  console.log(`  Cobrança Slice ID:    ${cobranca.id}`);
  console.log(`  Sprint 1 Test ID:     ${sprint1.id}`);
}

seed()
  .catch((e) => {
    console.error('[Seed] Error:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
