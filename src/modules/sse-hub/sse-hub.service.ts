import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { RealtimeEvent } from '../../contracts/models.js';
import { RepositoryPort } from '../../storage/interfaces/repository.port.js';
import { REPOSITORY } from '../../storage/interfaces/repository.tokens.js';

interface SseClient {
  id: string;
  reply: FastifyReply;
  request: FastifyRequest;
}

@Injectable()
export class SseHubService implements OnModuleDestroy {
  private clients = new Map<string, SseClient>();
  private heartbeatTimer: NodeJS.Timeout;

  constructor(
    @Inject(REPOSITORY) private readonly repo: RepositoryPort,
    private readonly logger: AppLogger,
  ) {
    this.heartbeatTimer = setInterval(() => {
      this.broadcast('heartbeat', { now: new Date().toISOString() }).catch(() => {
        // Best-effort heartbeat.
      });
    }, Number(process.env.SSE_HEARTBEAT_MS ?? 20000));
  }

  async onModuleDestroy() {
    clearInterval(this.heartbeatTimer);
  }

  private formatSse(event: RealtimeEvent): string {
    return `id: ${event.id}\nevent: ${event.event}\ndata: ${JSON.stringify(event.data)}\n\n`;
  }

  private makeEventId() {
    return `${Date.now()}-${Math.floor(Math.random() * 1_000_000)}`;
  }

  async connect(request: FastifyRequest, reply: FastifyReply) {
    const lastEventId = (request.headers['last-event-id'] as string | undefined) ?? undefined;
    const clientId = `${Date.now()}-${Math.random()}`;

    reply.raw.setHeader('Content-Type', 'text/event-stream');
    reply.raw.setHeader('Cache-Control', 'no-cache');
    reply.raw.setHeader('Connection', 'keep-alive');
    reply.raw.setHeader('X-Accel-Buffering', 'no');
    reply.raw.flushHeaders();

    this.clients.set(clientId, { id: clientId, reply, request });
    this.logger.info('sse_connected', { clientId, totalConnections: this.clients.size, lastEventId });

    if (lastEventId) {
      const missed = await this.repo.getRealtimeEventsAfter(lastEventId, 200);
      for (const evt of missed) {
        reply.raw.write(this.formatSse(evt));
      }
    }

    const initial: RealtimeEvent = {
      id: this.makeEventId(),
      event: 'heartbeat',
      data: { connectedAt: new Date().toISOString() },
      sentAt: new Date().toISOString(),
    };
    reply.raw.write(this.formatSse(initial));

    request.raw.on('close', () => {
      this.clients.delete(clientId);
      this.logger.info('sse_disconnected', { clientId, totalConnections: this.clients.size });
    });

    return reply;
  }

  async broadcast(type: RealtimeEvent['event'], data: Record<string, unknown>) {
    const event: RealtimeEvent = {
      id: this.makeEventId(),
      event: type,
      data,
      sentAt: new Date().toISOString(),
    };

    await this.repo.appendRealtimeEvent(event);

    const payload = this.formatSse(event);
    for (const [clientId, client] of this.clients.entries()) {
      try {
        client.reply.raw.write(payload);
      } catch {
        this.clients.delete(clientId);
      }
    }

    this.logger.info('sse_broadcast', {
      eventId: event.id,
      type,
      recipients: this.clients.size,
    });
  }
}
