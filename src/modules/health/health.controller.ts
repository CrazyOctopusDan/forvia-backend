import { Controller, Get } from '@nestjs/common';
import { HealthService } from './health.service.js';

@Controller('/health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('/live')
  live() {
    return {
      code: 'OK',
      message: 'alive',
      data: this.healthService.live(),
    };
  }

  @Get('/ready')
  async ready() {
    const data = await this.healthService.ready();
    return {
      code: data.status === 'ready' ? 'OK' : 'DEGRADED',
      message: data.status,
      data,
    };
  }
}
