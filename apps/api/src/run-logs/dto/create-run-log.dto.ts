import { IsString, IsNotEmpty, IsOptional, IsUUID, IsObject, IsIn } from 'class-validator';

export class CreateRunLogDto {
  @IsUUID()
  @IsNotEmpty()
  runId!: string;

  @IsString()
  @IsIn(['info', 'warn', 'error'])
  @IsOptional()
  level?: string;

  @IsString()
  @IsNotEmpty()
  message!: string;

  @IsObject()
  @IsOptional()
  context?: Record<string, unknown>;
}
