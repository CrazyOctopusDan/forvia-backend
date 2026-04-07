import { IsOptional, IsString, MaxLength } from 'class-validator';

export class AckAlarmDto {
  @IsString()
  @MaxLength(64)
  @IsOptional()
  operator?: string;
}
