import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsUUID,
  IsBoolean,
  IsArray,
  IsInt,
  Min,
  ValidateNested,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';

export class StepDefinitionDto {
  @IsString()
  @IsNotEmpty()
  key!: string;

  @IsString()
  @IsNotEmpty()
  type!: string; // condition, action, ai_task, delay, end

  @IsOptional()
  config?: Record<string, unknown>;
}

export class CreateWorkflowDto {
  @IsUUID()
  @IsNotEmpty()
  tenantId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsNotEmpty()
  triggerType!: string;

  @IsArray()
  @ArrayMinSize(2, { message: 'Workflow must have at least 2 steps (a start and an end)' })
  @ValidateNested({ each: true })
  @Type(() => StepDefinitionDto)
  steps!: StepDefinitionDto[];

  @IsBoolean()
  @IsOptional()
  isActive?: boolean;

  @IsInt()
  @Min(1)
  @IsOptional()
  version?: number;
}
