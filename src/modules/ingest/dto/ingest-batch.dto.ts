import { Type } from 'class-transformer';
import { IsArray, IsIn, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';

class MetricPointDto {
  @IsIn(['temp', 'vib'])
  metricType!: 'temp' | 'vib';

  @IsString()
  ts!: string;

  @Type(() => Number)
  @IsNumber()
  value!: number;

  @IsOptional()
  @IsString()
  quality?: string;
}

export class IngestBatchDto {
  @IsString()
  batchId!: string;

  @IsString()
  collectorId!: string;

  @IsString()
  sentAt!: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MetricPointDto)
  points!: MetricPointDto[];
}
