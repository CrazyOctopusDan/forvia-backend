import { Module } from '@nestjs/common';
import { SseHubService } from './sse-hub.service.js';
import { SseHubController } from './sse-hub.controller.js';

@Module({
  providers: [SseHubService],
  controllers: [SseHubController],
  exports: [SseHubService],
})
export class SseHubModule {}
