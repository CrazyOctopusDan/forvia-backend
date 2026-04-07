import { Body, Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ConfigService } from './config.service.js';
import { ReplaceLayoutDto } from './dto/replace-layout.dto.js';
import { SyncThresholdDto } from './dto/sync-threshold.dto.js';
import { UpsertThresholdDto } from './dto/upsert-threshold.dto.js';

@Controller('/config')
export class ConfigController {
  constructor(private readonly configService: ConfigService) {}

  @Get('/layout/collectors')
  async getLayout() {
    const data = await this.configService.getLayoutCollectors();
    return { code: 'OK', message: 'success', data };
  }

  @Put('/layout/collectors')
  async putLayout(@Body() body: ReplaceLayoutDto) {
    const data = await this.configService.replaceLayoutCollectors(body);
    return { code: 'OK', message: 'updated', data };
  }

  @Get('/thresholds')
  async getThresholds() {
    const data = await this.configService.getThresholds();
    return { code: 'OK', message: 'success', data };
  }

  @Put('/thresholds/:collectorId')
  async putThreshold(@Param('collectorId') collectorId: string, @Body() body: UpsertThresholdDto) {
    const data = await this.configService.updateThreshold(collectorId, {
      ...body,
      operator: body.operator ?? 'anonymous',
    });
    return { code: 'OK', message: 'updated', data };
  }

  @Post('/thresholds/sync')
  async syncThreshold(@Body() body: SyncThresholdDto) {
    const data = await this.configService.syncThresholds({
      sourceCollectorId: body.sourceCollectorId,
      targetCollectorIds: body.targetCollectorIds,
      operator: body.operator ?? 'anonymous',
    });
    return { code: 'OK', message: 'synced', data };
  }
}
