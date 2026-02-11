import { Controller, Post, Get, Param, Body, Query, ParseUUIDPipe } from '@nestjs/common';
import { EventsService } from './events.service';
import { CreateEventDto } from './dto';

@Controller('events')
export class EventsController {
  constructor(private readonly eventsService: EventsService) {}

  @Post()
  async create(@Body() body: CreateEventDto) {
    return this.eventsService.create(body);
  }

  @Get(':id')
  async findById(@Param('id', ParseUUIDPipe) id: string) {
    return this.eventsService.findById(id);
  }

  @Get()
  async findByTenant(@Query('tenantId', ParseUUIDPipe) tenantId: string) {
    return this.eventsService.findByTenant(tenantId);
  }
}
