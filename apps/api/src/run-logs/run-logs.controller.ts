import { Controller, Post, Get, Param, Body, Query, ParseUUIDPipe, DefaultValuePipe, ParseIntPipe } from '@nestjs/common';
import { RunLogsService } from './run-logs.service';
import { CreateRunLogDto } from './dto';

@Controller('run-logs')
export class RunLogsController {
  constructor(private readonly runLogsService: RunLogsService) {}

  @Post()
  async create(@Body() body: CreateRunLogDto) {
    return this.runLogsService.log({
      runId: body.runId,
      level: body.level ?? 'info',
      message: body.message,
      context: body.context,
    });
  }

  @Get('run/:runId')
  async findByRun(@Param('runId', ParseUUIDPipe) runId: string) {
    return this.runLogsService.findByRun(runId);
  }

  @Get()
  async findRecent(
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
  ) {
    return this.runLogsService.findRecent(limit);
  }
}
