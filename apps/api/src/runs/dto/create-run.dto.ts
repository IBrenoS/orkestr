import { IsUUID, IsNotEmpty, IsOptional, IsObject } from 'class-validator';

export class CreateRunDto {
  @IsUUID()
  @IsNotEmpty()
  workflowId!: string;

  @IsUUID()
  @IsNotEmpty()
  eventId!: string;

  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>;
}
