import { Type } from 'class-transformer';
import { IsIn, IsNumber, IsOptional, IsString } from 'class-validator';

export class DispatchNotificationDto {
  @IsString()
  taskId!: string;

  @IsString()
  eventId!: string;

  @IsIn(['in_app', 'sms', 'email', 'wecom', 'webhook'])
  channel!: 'in_app' | 'sms' | 'email' | 'wecom' | 'webhook';

  @IsString()
  target!: string;

  @IsIn(['pending', 'sent', 'failed', 'canceled'])
  status!: 'pending' | 'sent' | 'failed' | 'canceled';

  @Type(() => Number)
  @IsNumber()
  retryCount!: number;

  @IsOptional()
  @IsString()
  nextRetryAt?: string;
}
