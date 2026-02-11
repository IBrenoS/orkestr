import { Controller, Post, Get, Patch, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { WorkflowsService } from './workflows.service';
import { CreateWorkflowDto } from './dto';

@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly workflowsService: WorkflowsService) {}

  @Post()
  async create(@Body() body: CreateWorkflowDto) {
    return this.workflowsService.create(body);
  }

  @Patch(':id/publish')
  async publish(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowsService.publish(id);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.workflowsService.findById(id);
  }

  @Get()
  async findByTenant(@Query('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.workflowsService.findByTenant(tenantId);
  }
}
