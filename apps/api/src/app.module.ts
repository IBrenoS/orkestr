import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './health/health.module';
import { PrismaModule } from './prisma/prisma.module';
import { QueueModule } from './queue/queue.module';
import { TenantsModule } from './tenants/tenants.module';
import { EventsModule } from './events/events.module';
import { WorkflowsModule } from './workflows/workflows.module';
import { RunsModule } from './runs/runs.module';
import { RunLogsModule } from './run-logs/run-logs.module';
import { AuditModule } from './audit/audit.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: '../../.env',
    }),
    PrismaModule,
    QueueModule,
    HealthModule,
    TenantsModule,
    EventsModule,
    WorkflowsModule,
    RunsModule,
    RunLogsModule,
    AuditModule,
  ],
})
export class AppModule {}
