import { Type } from 'class-transformer';
import { IsArray, IsInt, IsNumber, IsString, Min, ValidateNested } from 'class-validator';

class CollectorLayoutDto {
  @IsString()
  collectorId!: string;

  @Type(() => Number)
  @IsNumber()
  x!: number;

  @Type(() => Number)
  @IsNumber()
  y!: number;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  zIndex!: number;

  @IsString()
  zone!: string;
}

export class ReplaceLayoutDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CollectorLayoutDto)
  collectors!: CollectorLayoutDto[];

  @IsString()
  operator!: string;
}
