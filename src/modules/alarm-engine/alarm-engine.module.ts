import { Module } from '@nestjs/common';
import { AlarmEngineService } from './alarm-engine.service.js';
import { AlarmEngineController } from './alarm-engine.controller.js';
import { SseHubModule } from '../sse-hub/sse-hub.module.js';
import { NotifierModule } from '../notifier/notifier.module.js';

@Module({
  imports: [SseHubModule, NotifierModule],
  controllers: [AlarmEngineController],
  providers: [AlarmEngineService],
  exports: [AlarmEngineService],
})
export class AlarmEngineModule {}
