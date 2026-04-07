import { Global, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { REPOSITORY, REDIS_CLIENT } from './interfaces/repository.tokens.js';
import { MockRepository } from './mock/mock.repository.js';
import { SqlServerClient } from './sqlserver/sqlserver.client.js';
import { SqlServerRepository } from './sqlserver/sqlserver.repository.js';

@Global()
@Module({
  providers: [
    SqlServerClient,
    MockRepository,
    SqlServerRepository,
    {
      provide: REPOSITORY,
      inject: [MockRepository, SqlServerRepository],
      useFactory: (mockRepo: MockRepository, sqlRepo: SqlServerRepository) => {
        const mode = (process.env.DB_MODE ?? 'mock').toLowerCase();
        return mode === 'sqlserver' ? sqlRepo : mockRepo;
      },
    },
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const host = process.env.REDIS_HOST ?? '127.0.0.1';
        const port = Number(process.env.REDIS_PORT ?? 6379);
        const password = process.env.REDIS_PASSWORD;
        const db = Number(process.env.REDIS_DB ?? 0);

        const redis = new Redis({
          host,
          port,
          password: password || undefined,
          db,
          lazyConnect: true,
          maxRetriesPerRequest: 2,
        });

        redis.connect().catch(() => {
          // Redis is optional for mock local startup.
        });
        redis.on('error', () => {
          // Keep process alive even when Redis is unavailable in local mock mode.
        });

        return redis;
      },
    },
  ],
  exports: [REPOSITORY, REDIS_CLIENT],
})
export class StorageModule {}
