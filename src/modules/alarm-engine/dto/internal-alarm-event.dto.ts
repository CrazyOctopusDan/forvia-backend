import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class InternalAlarmEventDto {
  @IsString()
  eventId!: string;

  @IsString()
  alarmId!: string;

  @IsString()
  collectorId!: string;

  @IsIn(['temp', 'vib'])
  metricType!: 'temp' | 'vib';

  @IsIn(['warn', 'alarm'])
  level!: 'warn' | 'alarm';

  @IsIn(['NORMAL', 'WARN', 'ALARM', 'RECOVERED', 'ACKED', 'IGNORED'])
  status!: 'NORMAL' | 'WARN' | 'ALARM' | 'RECOVERED' | 'ACKED' | 'IGNORED';

  @Type(() => Number)
  @IsNumber()
  actualValue!: number;

  @Type(() => Number)
  @IsNumber()
  thresholdValue!: number;

  @IsString()
  occurredAt!: string;

  @IsIn(['alarm-engine', 'external', 'manual'])
  source!: 'alarm-engine' | 'external' | 'manual';

  @IsOptional()
  payload?: Record<string, unknown>;
}
