import { Controller, Post, Get, Param, Body } from '@nestjs/common';
import { TenantsService } from './tenants.service';
import { CreateTenantDto } from './dto';

@Controller('tenants')
export class TenantsController {
  constructor(private readonly tenantsService: TenantsService) {}

  @Post()
  async create(@Body() body: CreateTenantDto) {
    return this.tenantsService.create(body);
  }

  @Get()
  async findAll() {
    return this.tenantsService.findAll();
  }

  @Get(':id')
  async findById(@Param('id') id: string) {
    return this.tenantsService.findById(id);
  }
}
