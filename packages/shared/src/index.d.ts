export { PrismaClient } from '@prisma/client';
export type { Tenant, Event, Workflow, Run, StepRun, AuditLog, RunStatus, StepRunStatus, } from '@prisma/client';
import { PrismaClient } from '@prisma/client';
export declare function getPrismaClient(): PrismaClient;
export declare function disconnectPrisma(): Promise<void>;
//# sourceMappingURL=index.d.ts.map