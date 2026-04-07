import { Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { IngestBatch } from '../../contracts/models.js';
import { RepositoryPort } from '../../storage/interfaces/repository.port.js';
import { REPOSITORY } from '../../storage/interfaces/repository.tokens.js';
import { AlarmEngineService } from '../alarm-engine/alarm-engine.service.js';
import { SseHubService } from '../sse-hub/sse-hub.service.js';

@Injectable()
export class IngestService {
  constructor(
    @Inject(REPOSITORY) private readonly repo: RepositoryPort,
    private readonly alarmEngine: AlarmEngineService,
    private readonly sseHub: SseHubService,
    private readonly logger: AppLogger,
  ) {}

  async ingestBatch(payload: IngestBatch) {
    const persistRes = await this.repo.saveMetricBatch(payload);

    if (!persistRes.duplicate) {
      await this.alarmEngine.evaluateBatch(payload);
    }

    const latest = await this.repo.queryCollectorRealtime([payload.collectorId]);
    const status = latest[0];
    if (status) {
      await this.sseHub.broadcast('collector-status', status as unknown as Record<string, unknown>);
    }

    this.logger.info('ingest_batch_processed', {
      batchId: payload.batchId,
      collectorId: payload.collectorId,
      points: payload.points.length,
      inserted: persistRes.inserted,
      duplicate: persistRes.duplicate,
    });

    return {
      batchId: payload.batchId,
      collectorId: payload.collectorId,
      inserted: persistRes.inserted,
      duplicate: persistRes.duplicate,
    };
  }
}
