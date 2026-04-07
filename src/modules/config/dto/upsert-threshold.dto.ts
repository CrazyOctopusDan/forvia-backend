import { Type } from 'class-transformer';
import { IsNumber, IsOptional, IsString } from 'class-validator';

export class UpsertThresholdDto {
  @Type(() => Number)
  @IsNumber()
  tempWarn!: number;

  @Type(() => Number)
  @IsNumber()
  tempAlarm!: number;

  @Type(() => Number)
  @IsNumber()
  vibWarn!: number;

  @Type(() => Number)
  @IsNumber()
  vibAlarm!: number;

  @IsString()
  @IsOptional()
  operator?: string;
}
