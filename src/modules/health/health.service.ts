import { Inject, Injectable } from '@nestjs/common';
import Redis from 'ioredis';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { RepositoryPort } from '../../storage/interfaces/repository.port.js';
import { REDIS_CLIENT, REPOSITORY } from '../../storage/interfaces/repository.tokens.js';

@Injectable()
export class HealthService {
  constructor(
    @Inject(REPOSITORY) private readonly repo: RepositoryPort,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly logger: AppLogger,
  ) {}

  live() {
    return {
      status: 'live',
      ts: new Date().toISOString(),
      dbMode: process.env.DB_MODE ?? 'mock',
    };
  }

  async ready() {
    const checks: Record<string, string> = {
      db: 'down',
      redis: 'down',
    };

    try {
      checks.db = (await this.repo.ping()) ? 'up' : 'down';
    } catch {
      checks.db = 'down';
    }

    try {
      const pong = await this.redis.ping();
      checks.redis = pong === 'PONG' ? 'up' : 'down';
    } catch {
      checks.redis = 'down';
    }

    this.logger.info('health_ready', checks);

    return {
      status: checks.db === 'up' ? 'ready' : 'degraded',
      ts: new Date().toISOString(),
      dbMode: process.env.DB_MODE ?? 'mock',
      checks,
    };
  }
}
