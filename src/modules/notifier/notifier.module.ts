import { Module } from '@nestjs/common';
import { NotifierService } from './notifier.service.js';
import { NotifierController } from './notifier.controller.js';

@Module({
  providers: [NotifierService],
  controllers: [NotifierController],
  exports: [NotifierService],
})
export class NotifierModule {}
