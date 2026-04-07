import { Injectable } from '@nestjs/common';
import {
  AlarmEventRecord,
  AlarmOutbox,
  AlarmRecord,
  CollectorLatestStatus,
  CollectorLayout,
  IngestBatch,
  MetricHistoryPoint,
  NotificationTaskRecord,
  RealtimeEvent,
  Threshold,
} from '../../contracts/models.js';
import { RepositoryPort } from '../interfaces/repository.port.js';

type MetricRow = {
  collectorId: string;
  metricType: 'temp' | 'vib';
  ts: string;
  value: number;
  quality?: string;
  batchId: string;
  ingestedAt: string;
};

@Injectable()
export class MockRepository implements RepositoryPort {
  private metricRows: MetricRow[] = [];
  private metricUniq = new Set<string>();
  private thresholds = new Map<string, Threshold>();
  private thresholdAudit: Array<{
    operator: string;
    actionType: string;
    sourceCollectorId?: string;
    targetCollectorId?: string;
    payload: string;
    createdAt: string;
  }> = [];
  private layouts = new Map<string, CollectorLayout>();
  private alarms = new Map<string, AlarmRecord>();
  private alarmEvents: AlarmEventRecord[] = [];
  private outbox = new Map<string, AlarmOutbox>();
  private notificationTasks = new Map<string, NotificationTaskRecord>();
  private realtimeEvents: RealtimeEvent[] = [];

  constructor() {
    for (let i = 1; i <= 50; i += 1) {
      const collectorId = `C${String(i).padStart(3, '0')}`;
      const now = new Date().toISOString();
      this.thresholds.set(collectorId, {
        collectorId,
        tempWarn: 60,
        tempAlarm: 75,
        vibWarn: 20,
        vibAlarm: 30,
        updatedBy: 'system-init',
        updatedAt: now,
      });
      this.layouts.set(collectorId, {
        collectorId,
        x: i % 10,
        y: Math.floor(i / 10),
        zIndex: 0,
        zone: `zone-${(i % 5) + 1}`,
        versionNo: 1,
        updatedBy: 'system-init',
        updatedAt: now,
      });
    }
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async saveMetricBatch(batch: IngestBatch): Promise<{ inserted: number; duplicate: boolean }> {
    let inserted = 0;
    for (const point of batch.points) {
      const key = `${batch.collectorId}:${point.metricType}:${point.ts}:${batch.batchId}`;
      if (this.metricUniq.has(key)) {
        continue;
      }
      this.metricUniq.add(key);
      this.metricRows.push({
        collectorId: batch.collectorId,
        metricType: point.metricType,
        ts: point.ts,
        value: point.value,
        quality: point.quality,
        batchId: batch.batchId,
        ingestedAt: new Date().toISOString(),
      });
      inserted += 1;
    }
    return { inserted, duplicate: inserted === 0 };
  }

  async queryLatestByCollectors(): Promise<CollectorLatestStatus[]> {
    return this.queryCollectorRealtime();
  }

  async queryCollectorRealtime(collectorIds?: string[]): Promise<CollectorLatestStatus[]> {
    const map = new Map<string, CollectorLatestStatus>();
    for (const row of this.metricRows) {
      if (collectorIds && !collectorIds.includes(row.collectorId)) {
        continue;
      }
      const existing = map.get(row.collectorId) ?? {
        collectorId: row.collectorId,
        status: 'NORMAL' as const,
        updatedAt: row.ts,
      };
      if (row.metricType === 'temp') {
        existing.tempValue = row.value;
      }
      if (row.metricType === 'vib') {
        existing.vibValue = row.value;
      }
      if (row.ts >= existing.updatedAt) {
        existing.updatedAt = row.ts;
      }

      const active = Array.from(this.alarms.values()).find(
        (alarm) => alarm.collectorId === row.collectorId && (alarm.status === 'WARN' || alarm.status === 'ALARM' || alarm.status === 'ACKED'),
      );
      if (active) {
        existing.status = active.status;
        existing.alarmLevel = active.level;
      }

      map.set(row.collectorId, existing);
    }

    for (const threshold of this.thresholds.values()) {
      if (!map.has(threshold.collectorId) && (!collectorIds || collectorIds.includes(threshold.collectorId))) {
        map.set(threshold.collectorId, {
          collectorId: threshold.collectorId,
          status: 'NORMAL',
          updatedAt: threshold.updatedAt,
        });
      }
    }

    return Array.from(map.values()).sort((a, b) => a.collectorId.localeCompare(b.collectorId));
  }

  async queryCollectorHistory(params: {
    collectorId: string;
    metric: 'temp' | 'vib';
    range: 'day' | 'week' | 'month';
    from?: string;
    to?: string;
  }): Promise<MetricHistoryPoint[]> {
    const filtered = this.metricRows.filter(
      (x) => x.collectorId === params.collectorId && x.metricType === params.metric,
    );

    const bucketMap = new Map<string, number[]>();
    for (const row of filtered) {
      const dt = new Date(row.ts);
      let key = '';
      if (params.range === 'day') {
        key = dt.toISOString().slice(0, 10);
      } else if (params.range === 'week') {
        const d = new Date(Date.UTC(dt.getUTCFullYear(), dt.getUTCMonth(), dt.getUTCDate()));
        const day = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() - day + 1);
        key = d.toISOString().slice(0, 10);
      } else {
        key = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-01`;
      }
      const arr = bucketMap.get(key) ?? [];
      arr.push(row.value);
      bucketMap.set(key, arr);
    }

    return Array.from(bucketMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timeKey, arr]) => {
        const minValue = Math.min(...arr);
        const maxValue = Math.max(...arr);
        const avgValue = Number((arr.reduce((s, n) => s + n, 0) / arr.length).toFixed(3));
        return {
          timeKey,
          minValue,
          maxValue,
          avgValue,
          sampleCount: arr.length,
        };
      });
  }

  async getThresholds(): Promise<Threshold[]> {
    return Array.from(this.thresholds.values()).sort((a, b) => a.collectorId.localeCompare(b.collectorId));
  }

  async getThreshold(collectorId: string): Promise<Threshold | undefined> {
    return this.thresholds.get(collectorId);
  }

  async upsertThreshold(threshold: Threshold): Promise<void> {
    this.thresholds.set(threshold.collectorId, threshold);
  }

  async appendThresholdAudit(record: {
    operator: string;
    actionType: string;
    sourceCollectorId?: string;
    targetCollectorId?: string;
    payload: string;
    createdAt: string;
  }): Promise<void> {
    this.thresholdAudit.push(record);
  }

  async getLayoutCollectors(): Promise<CollectorLayout[]> {
    return Array.from(this.layouts.values()).sort((a, b) => a.collectorId.localeCompare(b.collectorId));
  }

  async replaceLayoutCollectors(layouts: CollectorLayout[]): Promise<void> {
    this.layouts.clear();
    for (const l of layouts) {
      this.layouts.set(l.collectorId, l);
    }
  }

  async upsertAlarm(alarm: AlarmRecord): Promise<void> {
    this.alarms.set(alarm.alarmId, alarm);
  }

  async getActiveAlarms(): Promise<AlarmRecord[]> {
    return Array.from(this.alarms.values())
      .filter((a) => a.status === 'WARN' || a.status === 'ALARM' || a.status === 'ACKED')
      .sort((a, b) => b.lastChangedAt.localeCompare(a.lastChangedAt));
  }

  async getAlarmHistory(_params: { range: 'day' | 'week' | 'month' }): Promise<AlarmEventRecord[]> {
    return [...this.alarmEvents].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  }

  async getAlarmById(alarmId: string): Promise<AlarmRecord | undefined> {
    return this.alarms.get(alarmId);
  }

  async appendAlarmEvent(event: AlarmEventRecord): Promise<void> {
    if (!this.alarmEvents.find((x) => x.eventId === event.eventId)) {
      this.alarmEvents.push(event);
    }
  }

  async appendAlarmOutbox(outbox: AlarmOutbox): Promise<{ duplicate: boolean }> {
    if (this.outbox.has(outbox.eventId)) {
      return { duplicate: true };
    }
    this.outbox.set(outbox.eventId, outbox);
    return { duplicate: false };
  }

  async saveNotificationTask(task: NotificationTaskRecord): Promise<{ duplicate: boolean }> {
    if (this.notificationTasks.has(task.taskId)) {
      return { duplicate: true };
    }
    this.notificationTasks.set(task.taskId, task);
    return { duplicate: false };
  }

  async updateNotificationTask(taskId: string, patch: Partial<NotificationTaskRecord>): Promise<void> {
    const existing = this.notificationTasks.get(taskId);
    if (!existing) {
      return;
    }
    this.notificationTasks.set(taskId, {
      ...existing,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
  }

  async appendRealtimeEvent(event: RealtimeEvent): Promise<void> {
    this.realtimeEvents.push(event);
    if (this.realtimeEvents.length > 5000) {
      this.realtimeEvents = this.realtimeEvents.slice(-2000);
    }
  }

  async getRealtimeEventsAfter(lastEventId?: string, limit = 200): Promise<RealtimeEvent[]> {
    if (!lastEventId) {
      return this.realtimeEvents.slice(-limit);
    }
    const idx = this.realtimeEvents.findIndex((evt) => evt.id === lastEventId);
    if (idx < 0) {
      return this.realtimeEvents.slice(-limit);
    }
    return this.realtimeEvents.slice(idx + 1, idx + 1 + limit);
  }
}
