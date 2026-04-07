import { Controller, Get, Req, Res } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { SseHubService } from './sse-hub.service.js';

@Controller('/stream')
export class SseHubController {
  constructor(private readonly sseHubService: SseHubService) {}

  @Get('/collectors')
  async streamCollectors(@Req() req: FastifyRequest, @Res() reply: FastifyReply) {
    return this.sseHubService.connect(req, reply);
  }
}
