/**
 * Orkestr — Sprint 0 + Sprint 1 Seed
 *
 * Creates:
 *  - Demo tenant "Acme Corp"
 *  - "Cobrança Slice" workflow (condition → ai_task → action → end)
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
      rule: 'amount > 0',
    },
  },
  {
    key: 'enrich_context',
    type: 'ai_task',
    config: {
      description: 'Enriquece contexto com tom e dados do cliente (IA assistida)',
      fallback: 'use_default_template',
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
      rule: 'amount > 100',
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
