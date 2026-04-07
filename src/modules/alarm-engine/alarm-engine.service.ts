import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { AppError } from '../../common/utils/app-error.js';
import {
  AlarmEventRecord,
  AlarmLevel,
  AlarmRecord,
  IngestBatch,
  MetricPoint,
  NotificationTaskRecord,
  Threshold,
} from '../../contracts/models.js';
import { RepositoryPort } from '../../storage/interfaces/repository.port.js';
import { REPOSITORY } from '../../storage/interfaces/repository.tokens.js';
import { SseHubService } from '../sse-hub/sse-hub.service.js';
import { NotifierService } from '../notifier/notifier.service.js';

type DebounceState = {
  overWarnCount: number;
  overAlarmCount: number;
  normalCount: number;
};

@Injectable()
export class AlarmEngineService {
  private readonly debounceN = Number(process.env.ALARM_DEBOUNCE_N ?? 2);
  private readonly debounceM = Number(process.env.ALARM_RECOVER_M ?? 2);
  private stateMap = new Map<string, DebounceState>();

  constructor(
    @Inject(REPOSITORY) private readonly repo: RepositoryPort,
    private readonly logger: AppLogger,
    private readonly sseHub: SseHubService,
    private readonly notifier: NotifierService,
  ) {}

  private stateKey(collectorId: string, metricType: 'temp' | 'vib') {
    return `${collectorId}:${metricType}`;
  }

  private getState(collectorId: string, metricType: 'temp' | 'vib'): DebounceState {
    const key = this.stateKey(collectorId, metricType);
    const existing = this.stateMap.get(key);
    if (existing) {
      return existing;
    }
    const init: DebounceState = { overWarnCount: 0, overAlarmCount: 0, normalCount: 0 };
    this.stateMap.set(key, init);
    return init;
  }

  private getAlarmId(collectorId: string, metricType: 'temp' | 'vib') {
    return `ALM-${collectorId}-${metricType}`;
  }

  async evaluateBatch(batch: IngestBatch) {
    const threshold = await this.repo.getThreshold(batch.collectorId);
    if (!threshold) {
      return;
    }

    for (const point of batch.points) {
      await this.evaluatePoint(batch.collectorId, threshold, point);
    }
  }

  private resolveLevel(threshold: Threshold, point: MetricPoint): AlarmLevel | 'normal' {
    if (point.metricType === 'temp') {
      if (point.value > threshold.tempAlarm) {
        return 'alarm';
      }
      if (point.value > threshold.tempWarn) {
        return 'warn';
      }
      return 'normal';
    }

    if (point.value > threshold.vibAlarm) {
      return 'alarm';
    }
    if (point.value > threshold.vibWarn) {
      return 'warn';
    }
    return 'normal';
  }

  private resolveThresholdValue(threshold: Threshold, metricType: 'temp' | 'vib', level: AlarmLevel) {
    if (metricType === 'temp') {
      return level === 'alarm' ? threshold.tempAlarm : threshold.tempWarn;
    }
    return level === 'alarm' ? threshold.vibAlarm : threshold.vibWarn;
  }

  private async emitAlarmEvent(input: {
    collectorId: string;
    metricType: 'temp' | 'vib';
    level: AlarmLevel;
    status: AlarmRecord['status'];
    actualValue: number;
    thresholdValue: number;
    source: 'alarm-engine' | 'manual' | 'external';
    occurredAt: string;
    ackedBy?: string;
  }) {
    const alarmId = this.getAlarmId(input.collectorId, input.metricType);
    const existing = await this.repo.getAlarmById(alarmId);
    const eventId = randomUUID();

    const alarm: AlarmRecord = {
      alarmId,
      collectorId: input.collectorId,
      metricType: input.metricType,
      level: input.level,
      status: input.status,
      firstTriggeredAt: existing?.firstTriggeredAt ?? input.occurredAt,
      lastChangedAt: input.occurredAt,
      ackedBy: input.ackedBy ?? existing?.ackedBy,
      ackedAt: input.status === 'ACKED' ? input.occurredAt : existing?.ackedAt,
    };

    const event: AlarmEventRecord = {
      eventId,
      alarmId,
      collectorId: input.collectorId,
      metricType: input.metricType,
      level: input.level,
      status: input.status,
      actualValue: input.actualValue,
      thresholdValue: input.thresholdValue,
      occurredAt: input.occurredAt,
      source: input.source,
    };

    await this.repo.upsertAlarm(alarm);
    await this.repo.appendAlarmEvent(event);
    await this.repo.appendAlarmOutbox({
      eventId,
      payload: JSON.stringify(event),
      dispatchStatus: 'pending',
      retryCount: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    });

    this.logger.info('alarm_event_emitted', {
      alarmId,
      eventId,
      status: input.status,
      level: input.level,
      collectorId: input.collectorId,
      metricType: input.metricType,
    });

    await this.sseHub.broadcast('alarm-change', {
      eventId,
      alarmId,
      collectorId: input.collectorId,
      metricType: input.metricType,
      level: input.level,
      status: input.status,
      actualValue: input.actualValue,
      thresholdValue: input.thresholdValue,
      occurredAt: input.occurredAt,
    });

    const task: NotificationTaskRecord = {
      taskId: randomUUID(),
      eventId,
      channel: 'in_app',
      target: input.collectorId,
      status: 'pending',
      retryCount: 0,
      createdAt: input.occurredAt,
      updatedAt: input.occurredAt,
    };

    await this.notifier.dispatchTask(task);
  }

  private async evaluatePoint(collectorId: string, threshold: Threshold, point: MetricPoint) {
    const state = this.getState(collectorId, point.metricType);
    const level = this.resolveLevel(threshold, point);
    const alarmId = this.getAlarmId(collectorId, point.metricType);
    const existing = await this.repo.getAlarmById(alarmId);

    if (level === 'alarm') {
      state.overAlarmCount += 1;
      state.overWarnCount += 1;
      state.normalCount = 0;
    } else if (level === 'warn') {
      state.overWarnCount += 1;
      state.overAlarmCount = 0;
      state.normalCount = 0;
    } else {
      state.normalCount += 1;
      state.overWarnCount = 0;
      state.overAlarmCount = 0;
    }

    const occurredAt = point.ts;
    const isActive = existing && (existing.status === 'WARN' || existing.status === 'ALARM' || existing.status === 'ACKED');

    if (!isActive && level !== 'normal' && state.overWarnCount >= this.debounceN) {
      const triggerLevel: AlarmLevel = level === 'alarm' && state.overAlarmCount >= this.debounceN ? 'alarm' : 'warn';
      await this.emitAlarmEvent({
        collectorId,
        metricType: point.metricType,
        level: triggerLevel,
        status: triggerLevel === 'alarm' ? 'ALARM' : 'WARN',
        actualValue: point.value,
        thresholdValue: this.resolveThresholdValue(threshold, point.metricType, triggerLevel),
        source: 'alarm-engine',
        occurredAt,
      });
      return;
    }

    if (isActive && level === 'alarm' && state.overAlarmCount >= this.debounceN && existing?.status !== 'ALARM') {
      await this.emitAlarmEvent({
        collectorId,
        metricType: point.metricType,
        level: 'alarm',
        status: 'ALARM',
        actualValue: point.value,
        thresholdValue: this.resolveThresholdValue(threshold, point.metricType, 'alarm'),
        source: 'alarm-engine',
        occurredAt,
      });
      return;
    }

    if (isActive && level === 'normal' && state.normalCount >= this.debounceM) {
      const prevLevel: AlarmLevel = existing?.level ?? 'warn';
      await this.emitAlarmEvent({
        collectorId,
        metricType: point.metricType,
        level: prevLevel,
        status: 'RECOVERED',
        actualValue: point.value,
        thresholdValue: this.resolveThresholdValue(threshold, point.metricType, prevLevel),
        source: 'alarm-engine',
        occurredAt,
      });
    }
  }

  async ackAlarm(alarmId: string, operator: string) {
    const existing = await this.repo.getAlarmById(alarmId);
    if (!existing) {
      throw new AppError('ALARM_NOT_FOUND', `Alarm ${alarmId} not found`, HttpStatus.NOT_FOUND);
    }

    if (!(existing.status === 'WARN' || existing.status === 'ALARM' || existing.status === 'ACKED')) {
      throw new AppError('ALARM_STATE_INVALID', `Alarm ${alarmId} is not ack-able in status ${existing.status}`);
    }

    await this.emitAlarmEvent({
      collectorId: existing.collectorId,
      metricType: existing.metricType,
      level: existing.level,
      status: 'ACKED',
      actualValue: 0,
      thresholdValue: 0,
      source: 'manual',
      occurredAt: new Date().toISOString(),
      ackedBy: operator,
    });

    this.logger.info('alarm_acked', { alarmId, operator });
    return { alarmId, status: 'ACKED', ackedBy: operator, ackedAt: new Date().toISOString() };
  }

  async ingestExternalEvent(payload: AlarmEventRecord) {
    await this.repo.appendAlarmEvent(payload);
    const outboxRes = await this.repo.appendAlarmOutbox({
      eventId: payload.eventId,
      payload: JSON.stringify(payload),
      dispatchStatus: 'pending',
      retryCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    if (outboxRes.duplicate) {
      throw new AppError('ALARM_EVENT_IDEMPOTENT_HIT', `eventId ${payload.eventId} already exists`);
    }

    await this.sseHub.broadcast('alarm-change', payload as unknown as Record<string, unknown>);

    return { eventId: payload.eventId, accepted: true };
  }
}
