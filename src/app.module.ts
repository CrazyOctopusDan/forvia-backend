import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { HealthModule } from './modules/health/health.module.js';
import { IngestModule } from './modules/ingest/ingest.module.js';
import { AlarmEngineModule } from './modules/alarm-engine/alarm-engine.module.js';
import { NotifierModule } from './modules/notifier/notifier.module.js';
import { SseHubModule } from './modules/sse-hub/sse-hub.module.js';
import { ConfigFeatureModule } from './modules/config/config.module.js';
import { ApiQueryModule } from './modules/api-query/api-query.module.js';
import { StorageModule } from './storage/storage.module.js';
import { AppLoggerModule } from './common/logger/app-logger.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    AppLoggerModule,
    StorageModule,
    SseHubModule,
    AlarmEngineModule,
    NotifierModule,
    IngestModule,
    ConfigFeatureModule,
    ApiQueryModule,
    HealthModule,
  ],
})
export class AppModule {}
