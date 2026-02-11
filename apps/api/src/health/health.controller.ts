import { Controller, Get } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('health')
export class HealthController {
  private readonly startedAt = new Date();

  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    const dbHealthy = await this.prisma.isHealthy();

    const status = dbHealthy ? 'ok' : 'degraded';
    const uptimeMs = Date.now() - this.startedAt.getTime();

    return {
      status,
      timestamp: new Date().toISOString(),
      service: 'orkestr-api',
      version: '0.1.0',
      uptime: `${Math.floor(uptimeMs / 1000)}s`,
      checks: {
        database: dbHealthy ? 'connected' : 'disconnected',
      },
    };
  }
}
