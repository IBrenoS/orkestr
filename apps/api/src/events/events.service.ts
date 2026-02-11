import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEventDto } from './dto';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Normalizes event type to lowercase snake_case.
   */
  private normalizeType(type: string): string {
    return type
      .trim()
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '');
  }

  /**
   * Normalizes source to lowercase.
   */
  private normalizeSource(source: string): string {
    return source.trim().toLowerCase();
  }

  async create(dto: CreateEventDto) {
    // Verify tenant exists
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: dto.tenantId },
    });

    if (!tenant) {
      throw new NotFoundException(`Tenant ${dto.tenantId} not found`);
    }

    const normalizedType = this.normalizeType(dto.type);
    const normalizedSource = this.normalizeSource(dto.source ?? 'api');

    // Idempotency check: (tenantId, source, externalId)
    if (dto.externalId) {
      const existing = await this.prisma.event.findUnique({
        where: {
          tenantId_source_externalId: {
            tenantId: dto.tenantId,
            source: normalizedSource,
            externalId: dto.externalId,
          },
        },
      });

      if (existing) {
        // Return existing event — idempotent behavior, no duplicate
        return { ...existing, _idempotent: true };
      }
    }

    const event = await this.prisma.event.create({
      data: {
        tenantId: dto.tenantId,
        type: normalizedType,
        payload: (dto.payload ?? {}) as any,
        source: normalizedSource,
        externalId: dto.externalId ?? null,
      },
    });

    // Audit log
    await this.prisma.auditLog.create({
      data: {
        entity: 'event',
        entityId: event.id,
        action: 'created',
        details: {
          type: event.type,
          source: event.source,
          externalId: event.externalId,
        } as any,
      },
    });

    return event;
  }

  async findById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: { runs: true },
    });

    if (!event) {
      throw new NotFoundException(`Event ${id} not found`);
    }

    return event;
  }

  async findByTenant(tenantId: string, limit = 50) {
    return this.prisma.event.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
