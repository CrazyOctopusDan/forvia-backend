import { Module } from '@nestjs/common';
import { ApiQueryController } from './api-query.controller.js';
import { ApiQueryService } from './api-query.service.js';

@Module({
  controllers: [ApiQueryController],
  providers: [ApiQueryService],
})
export class ApiQueryModule {}
