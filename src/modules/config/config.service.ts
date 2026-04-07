import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppError } from '../../common/utils/app-error.js';
import { CollectorLayout, Threshold } from '../../contracts/models.js';
import { RepositoryPort } from '../../storage/interfaces/repository.port.js';
import { REPOSITORY } from '../../storage/interfaces/repository.tokens.js';

@Injectable()
export class ConfigService {
  constructor(@Inject(REPOSITORY) private readonly repo: RepositoryPort) {}

  async getThresholds() {
    return this.repo.getThresholds();
  }

  async updateThreshold(collectorId: string, payload: {
    tempWarn: number;
    tempAlarm: number;
    vibWarn: number;
    vibAlarm: number;
    operator: string;
  }) {
    if (!(payload.tempWarn < payload.tempAlarm) || !(payload.vibWarn < payload.vibAlarm)) {
      throw new AppError('THRESHOLD_RULE_INVALID', 'temp_warn < temp_alarm and vib_warn < vib_alarm must hold');
    }

    const now = new Date().toISOString();
    const threshold: Threshold = {
      collectorId,
      tempWarn: payload.tempWarn,
      tempAlarm: payload.tempAlarm,
      vibWarn: payload.vibWarn,
      vibAlarm: payload.vibAlarm,
      updatedBy: payload.operator,
      updatedAt: now,
    };

    await this.repo.upsertThreshold(threshold);
    await this.repo.appendThresholdAudit({
      operator: payload.operator,
      actionType: 'update_single',
      sourceCollectorId: collectorId,
      targetCollectorId: collectorId,
      payload: JSON.stringify(threshold),
      createdAt: now,
    });

    return threshold;
  }

  async syncThresholds(payload: {
    sourceCollectorId: string;
    targetCollectorIds: string[];
    operator: string;
  }) {
    const source = await this.repo.getThreshold(payload.sourceCollectorId);
    if (!source) {
      throw new AppError('THRESHOLD_TARGET_NOT_FOUND', `source collector ${payload.sourceCollectorId} not found`, HttpStatus.NOT_FOUND);
    }

    const now = new Date().toISOString();
    const results: Array<{ collectorId: string; success: boolean; reason?: string }> = [];

    for (const targetId of payload.targetCollectorIds) {
      try {
        await this.repo.upsertThreshold({
          collectorId: targetId,
          tempWarn: source.tempWarn,
          tempAlarm: source.tempAlarm,
          vibWarn: source.vibWarn,
          vibAlarm: source.vibAlarm,
          updatedBy: payload.operator,
          updatedAt: now,
        });
        await this.repo.appendThresholdAudit({
          operator: payload.operator,
          actionType: 'sync_batch',
          sourceCollectorId: payload.sourceCollectorId,
          targetCollectorId: targetId,
          payload: JSON.stringify(source),
          createdAt: now,
        });
        results.push({ collectorId: targetId, success: true });
      } catch (error) {
        results.push({ collectorId: targetId, success: false, reason: String(error) });
      }
    }

    return {
      sourceCollectorId: payload.sourceCollectorId,
      results,
    };
  }

  async getLayoutCollectors() {
    return this.repo.getLayoutCollectors();
  }

  async replaceLayoutCollectors(payload: { collectors: Array<{ collectorId: string; x: number; y: number; zIndex: number; zone: string }>; operator: string }) {
    const uniq = new Set<string>();
    for (const c of payload.collectors) {
      if (uniq.has(c.collectorId)) {
        throw new AppError('LAYOUT_COLLECTOR_DUPLICATE', `collectorId ${c.collectorId} duplicated`);
      }
      uniq.add(c.collectorId);
    }

    const now = new Date().toISOString();
    const versionNo = 1;
    const layouts: CollectorLayout[] = payload.collectors.map((x) => ({
      collectorId: x.collectorId,
      x: x.x,
      y: x.y,
      zIndex: x.zIndex,
      zone: x.zone,
      versionNo,
      updatedBy: payload.operator,
      updatedAt: now,
    }));

    await this.repo.replaceLayoutCollectors(layouts);
    return { versionNo, count: layouts.length };
  }
}
