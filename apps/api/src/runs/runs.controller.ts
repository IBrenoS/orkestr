import { Controller, Post, Get, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { RunsService } from './runs.service';
import { CreateRunDto } from './dto';

@Controller('runs')
export class RunsController {
  constructor(private readonly runsService: RunsService) {}

  @Post()
  async create(@Body() body: CreateRunDto) {
    return this.runsService.create(body);
  }

  /** Failed runs list — DLQ visibility (Sprint 1 Day 5) */
  @Get('failed')
  async findFailed(@Query('limit') limit?: string) {
    return this.runsService.findFailed(parseInt(limit || '50', 10));
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.runsService.findById(id);
  }

  @Get()
  async findByWorkflow(@Query('workflowId', ParseUUIDPipe) workflowId: string) {
    return this.runsService.findByWorkflow(workflowId);
  }
}
