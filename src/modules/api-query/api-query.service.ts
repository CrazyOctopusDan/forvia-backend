import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/utils/app-error.js';
import { RepositoryPort } from '../../storage/interfaces/repository.port.js';
import { REPOSITORY } from '../../storage/interfaces/repository.tokens.js';

@Injectable()
export class ApiQueryService {
  constructor(@Inject(REPOSITORY) private readonly repo: RepositoryPort) {}

  async getDashboardSnapshot() {
    const collectors = await this.repo.queryLatestByCollectors();
    const alarms = await this.repo.getActiveAlarms();

    return {
      snapshotTime: new Date().toISOString(),
      kpi: {
        totalCollectors: collectors.length,
        alarmCount: alarms.filter((x) => x.level === 'alarm').length,
        warnCount: alarms.filter((x) => x.level === 'warn').length,
      },
      collectors,
    };
  }

  async getRealtimeFallback() {
    return this.repo.queryCollectorRealtime();
  }

  async getHistory(params: {
    collectorId: string;
    metric: 'temp' | 'vib';
    range: 'day' | 'week' | 'month';
  }) {
    if (!['day', 'week', 'month'].includes(params.range)) {
      throw new AppError('HISTORY_RANGE_INVALID', 'range must be day|week|month', HttpStatus.BAD_REQUEST);
    }
    return this.repo.queryCollectorHistory(params);
  }

  async getActiveAlarms() {
    return this.repo.getActiveAlarms();
  }

  async getAlarmHistory(range: 'day' | 'week' | 'month') {
    return this.repo.getAlarmHistory({ range });
  }
}
