import { IsArray, IsOptional, IsString } from 'class-validator';

export class SyncThresholdDto {
  @IsString()
  sourceCollectorId!: string;

  @IsArray()
  targetCollectorIds!: string[];

  @IsString()
  @IsOptional()
  operator?: string;
}
