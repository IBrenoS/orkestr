import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateWorkflowDto, StepDefinitionDto } from './dto';

/** Valid step types for the Execution Engine */
const VALID_STEP_TYPES = ['condition', 'action', 'ai_task', 'delay', 'end'];

@Injectable()
export class WorkflowsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Validates step definitions:
   *  - All types must be valid
   *  - Must have at least one "end" step
   *  - First step must be condition or action (not end)
   */
  private validateSteps(steps: StepDefinitionDto[]) {
    for (const step of steps) {
      if (!VALID_STEP_TYPES.includes(step.type)) {
        throw new BadRequestException(
          `Invalid step type "${step.type}". Valid types: ${VALID_STEP_TYPES.join(', ')}`,
        );
      }
    }

    const hasEnd = steps.some((s) => s.type === 'end');
    if (!hasEnd) {
      throw new BadRequestException(
        'Workflow must have at least one "end" step',
      );
    }

    const firstStep = steps[0];
    if (firstStep.type === 'end') {
      throw new BadRequestException(
        'First step cannot be "end". Workflow needs a real start step.',
      );
    }

    // Check duplicate keys
    const keys = steps.map((s) => s.key);
    const uniqueKeys = new Set(keys);
    if (uniqueKeys.size !== keys.length) {
      throw new BadRequestException('Step keys must be unique within a workflow');
    }
  }

  async create(dto: CreateWorkflowDto) {
    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} not found`);
    }

    this.validateSteps(dto.steps);

    const workflow = await this.prisma.workflow.create({
      data: {
        tenantId: dto.tenantId,
        name: dto.name,
        description: dto.description,
        triggerType: dto.triggerType,
        steps: dto.steps as any,
        isActive: dto.isActive ?? true,
        version: dto.version ?? 1,
      },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: 'workflow',
        entityId: workflow.id,
        action: 'created',
        details: {
          name: workflow.name,
          triggerType: workflow.triggerType,
          version: workflow.version,
          stepCount: dto.steps.length,
        } as any,
      },
    });

    return workflow;
  }

  /**
   * Publishes a workflow — from this point, steps become immutable for any runs.
   */
  async publish(id: string) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id } });

    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }

    if (workflow.publishedAt) {
      throw new ConflictException(
        `Workflow ${id} is already published at ${workflow.publishedAt.toISOString()}`,
      );
    }

    const steps = workflow.steps as any[];
    if (!steps || steps.length < 2) {
      throw new BadRequestException(
        'Cannot publish a workflow with fewer than 2 steps',
      );
    }

    const updated = await this.prisma.workflow.update({
      where: { id },
      data: { publishedAt: new Date() },
    });

    await this.prisma.auditLog.create({
      data: {
        entity: 'workflow',
        entityId: id,
        action: 'published',
        details: { version: updated.version } as any,
      },
    });

    return updated;
  }

  async findById(id: string) {
    const workflow = await this.prisma.workflow.findUnique({ where: { id } });
    if (!workflow) {
      throw new NotFoundException(`Workflow ${id} not found`);
    }
    return workflow;
  }

  async findByTenant(tenantId: string) {
    return this.prisma.workflow.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByTriggerType(tenantId: string, triggerType: string) {
    return this.prisma.workflow.findMany({
      where: {
        tenantId,
        triggerType,
        isActive: true,
        publishedAt: { not: null }, // only published workflows
      },
      orderBy: { version: 'desc' },
    });
  }
}
