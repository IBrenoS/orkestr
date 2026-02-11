import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { QueueService } from '../queue/queue.service';
import { CreateRunDto } from './dto';

interface StepDef {
  key: string;
  type: string;
  config?: Record<string, unknown>;
}

@Injectable()
export class RunsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queueService: QueueService,
  ) {}

  async create(dto: CreateRunDto) {
    // Verify workflow exists and is published
    const workflow = await this.prisma.workflow.findUnique({
      where: { id: dto.workflowId },
    });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${dto.workflowId} not found`);
    }

    if (!workflow.publishedAt) {
      throw new BadRequestException(
        `Workflow ${dto.workflowId} is not published. Publish it first.`,
      );
    }

    // Verify event exists
    const event = await this.prisma.event.findUnique({
      where: { id: dto.eventId },
    });

    if (!event) {
      throw new NotFoundException(`Event ${dto.eventId} not found`);
    }

    const steps = workflow.steps as unknown as StepDef[];

    // Create run + first step_run in a transaction
    const result = await this.prisma.$transaction(async (tx) => {
      const run = await tx.run.create({
        data: {
          workflowId: dto.workflowId,
          eventId: dto.eventId,
          status: 'PENDING',
          context: (dto.context ?? {}) as any,
        },
      });

      // RunLog: run created
      await tx.runLog.create({
        data: {
          runId: run.id,
          level: 'info',
          message: `Run created for workflow "${workflow.name}" v${workflow.version}`,
          context: {
            workflowId: workflow.id,
            eventId: event.id,
            eventType: event.type,
          } as any,
        },
      });

      // Create the first step_run automatically
      let firstStepRun = null;
      if (steps.length > 0) {
        const firstStep = steps[0];
        firstStepRun = await tx.stepRun.create({
          data: {
            runId: run.id,
            stepKey: firstStep.key,
            stepType: firstStep.type,
            status: 'PENDING',
            input: (event.payload ?? {}) as any,
          },
        });

        // RunLog: step created
        await tx.runLog.create({
          data: {
            runId: run.id,
            level: 'info',
            message: `Step "${firstStep.key}" (${firstStep.type}) created as PENDING`,
            context: {
              stepRunId: firstStepRun.id,
              stepKey: firstStep.key,
              stepType: firstStep.type,
            } as any,
          },
        });
      }

      // Audit logs
      await tx.auditLog.create({
        data: {
          entity: 'run',
          entityId: run.id,
          action: 'created',
          details: {
            workflowId: run.workflowId,
            eventId: run.eventId,
            status: run.status,
            firstStepKey: steps[0]?.key ?? null,
          } as any,
        },
      });

      if (firstStepRun) {
        await tx.auditLog.create({
          data: {
            entity: 'step_run',
            entityId: firstStepRun.id,
            action: 'created',
            details: {
              runId: run.id,
              stepKey: firstStepRun.stepKey,
              stepType: firstStepRun.stepType,
            } as any,
          },
        });
      }

      return { run, firstStepRun };
    });

    // Dispatch first step to worker queue
    if (result.firstStepRun) {
      await this.queueService.dispatchStep(
        result.firstStepRun.id,
        result.firstStepRun.stepType,
      );
    }

    return result;
  }

  async findById(id: string) {
    const run = await this.prisma.run.findUnique({
      where: { id },
      include: { stepRuns: true, event: true, workflow: true, runLogs: { orderBy: { createdAt: 'asc' } } },
    });

    if (!run) {
      throw new NotFoundException(`Run ${id} not found`);
    }

    return run;
  }

  async findByWorkflow(workflowId: string, limit = 50) {
    return this.prisma.run.findMany({
      where: { workflowId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: { stepRuns: true },
    });
  }

  async findByEvent(eventId: string) {
    return this.prisma.run.findMany({
      where: { eventId },
      orderBy: { createdAt: 'desc' },
      include: { stepRuns: true },
    });
  }

  async findFailed(limit = 50) {
    return this.prisma.run.findMany({
      where: { status: 'FAILED' },
      orderBy: { finishedAt: 'desc' },
      take: limit,
      include: {
        stepRuns: { orderBy: { createdAt: 'asc' } },
        runLogs: { where: { level: 'error' }, orderBy: { createdAt: 'desc' } },
        workflow: { select: { id: true, name: true, version: true } },
      },
    });
  }
}
