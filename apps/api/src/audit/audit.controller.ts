import { Controller, Get, Query, ParseIntPipe, DefaultValuePipe } from '@nestjs/common';
import { AuditService } from './audit.service';

@Controller('audit')
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  async findRecent(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.auditService.findRecent(limit);
  }

  @Get('entity')
  async findByEntity(
    @Query('entity') entity: string,
    @Query('entityId') entityId: string,
  ) {
    return this.auditService.findByEntity(entity, entityId);
  }
}
