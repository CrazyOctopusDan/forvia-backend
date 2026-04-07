import { Module } from '@nestjs/common';
import { IngestController } from './ingest.controller.js';
import { IngestService } from './ingest.service.js';
import { AlarmEngineModule } from '../alarm-engine/alarm-engine.module.js';
import { SseHubModule } from '../sse-hub/sse-hub.module.js';

@Module({
  imports: [AlarmEngineModule, SseHubModule],
  controllers: [IngestController],
  providers: [IngestService],
})
export class IngestModule {}
