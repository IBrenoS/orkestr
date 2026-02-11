import { IsString, IsNotEmpty, IsOptional, IsUUID, IsObject } from 'class-validator';

export class CreateEventDto {
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  type!: string;

  @IsObject()
  @IsOptional()
  payload?: Record<string, unknown>;

  @IsString()
  @IsOptional()
  source?: string;

  @IsString()
  @IsOptional()
  externalId?: string;
}
