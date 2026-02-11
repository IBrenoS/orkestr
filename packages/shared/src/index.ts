export { PrismaClient } from '@prisma/client';
export type {
  Tenant,
  Event,
  Workflow,
  Run,
  StepRun,
  RunLog,
  AuditLog,
  RunStatus,
  StepRunStatus,
} from '@prisma/client';

import { PrismaClient } from '@prisma/client';

let prisma: PrismaClient | undefined;

export function getPrismaClient(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
    });
  }
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = undefined;
  }
}
