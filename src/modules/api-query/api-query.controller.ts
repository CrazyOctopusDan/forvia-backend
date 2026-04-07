import { Controller, Get, Query } from '@nestjs/common';
import { ApiQueryService } from './api-query.service.js';

@Controller()
export class ApiQueryController {
  constructor(private readonly queryService: ApiQueryService) {}

  @Get('/dashboard/snapshot')
  async snapshot() {
    const data = await this.queryService.getDashboardSnapshot();
    return { code: 'OK', message: 'success', data };
  }

  @Get('/collectors/realtime')
  async collectorsRealtime() {
    const data = await this.queryService.getRealtimeFallback();
    return { code: 'OK', message: 'success', data };
  }

  @Get('/collectors/history')
  async collectorsHistory(
    @Query('collectorId') collectorId: string,
    @Query('metric') metric: 'temp' | 'vib',
    @Query('range') range: 'day' | 'week' | 'month',
  ) {
    const data = await this.queryService.getHistory({ collectorId, metric, range });
    return { code: 'OK', message: 'success', data };
  }

  @Get('/alarms/active')
  async alarmsActive() {
    const data = await this.queryService.getActiveAlarms();
    return { code: 'OK', message: 'success', data };
  }

  @Get('/alarms/history')
  async alarmsHistory(@Query('range') range: 'day' | 'week' | 'month' = 'day') {
    const data = await this.queryService.getAlarmHistory(range);
    return { code: 'OK', message: 'success', data };
  }
}
