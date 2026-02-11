import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateRunLogInput {
  runId: string;
  level: string;
  message: string;
  context?: Record<string, unknown>;
}

@Injectable()
export class RunLogsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Write a log entry for a run.
   * Used internally by services and externally via API.
   */
  async log(input: CreateRunLogInput) {
    // Verify run exists
    const run = await this.prisma.run.findUnique({
      where: { id: input.runId },
    });

    if (!run) {
      throw new NotFoundException(`Run ${input.runId} not found`);
    }

    return this.prisma.runLog.create({
      data: {
        runId: input.runId,
        level: input.level || 'info',
        message: input.message,
        context: (input.context ?? {}) as any,
      },
    });
  }

  /**
   * Convenience: log info-level message
   */
  async info(runId: string, message: string, context?: Record<string, unknown>) {
    return this.log({ runId, level: 'info', message, context });
  }

  /**
   * Convenience: log warn-level message
   */
  async warn(runId: string, message: string, context?: Record<string, unknown>) {
    return this.log({ runId, level: 'warn', message, context });
  }

  /**
   * Convenience: log error-level message
   */
  async error(runId: string, message: string, context?: Record<string, unknown>) {
    return this.log({ runId, level: 'error', message, context });
  }

  /**
   * Get all logs for a run, ordered chronologically.
   */
  async findByRun(runId: string) {
    return this.prisma.runLog.findMany({
      where: { runId },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get recent logs across all runs.
   */
  async findRecent(limit = 100) {
    return this.prisma.runLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
