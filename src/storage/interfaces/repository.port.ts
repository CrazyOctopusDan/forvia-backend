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

export interface RepositoryPort {
  ping(): Promise<boolean>;

  saveMetricBatch(batch: IngestBatch): Promise<{ inserted: number; duplicate: boolean }>;
  queryLatestByCollectors(): Promise<CollectorLatestStatus[]>;
  queryCollectorRealtime(collectorIds?: string[]): Promise<CollectorLatestStatus[]>;
  queryCollectorHistory(params: {
    collectorId: string;
    metric: 'temp' | 'vib';
    range: 'day' | 'week' | 'month';
    from?: string;
    to?: string;
  }): Promise<MetricHistoryPoint[]>;

  getThresholds(): Promise<Threshold[]>;
  getThreshold(collectorId: string): Promise<Threshold | undefined>;
  upsertThreshold(threshold: Threshold): Promise<void>;
  appendThresholdAudit(record: {
    operator: string;
    actionType: string;
    sourceCollectorId?: string;
    targetCollectorId?: string;
    payload: string;
    createdAt: string;
  }): Promise<void>;

  getLayoutCollectors(): Promise<CollectorLayout[]>;
  replaceLayoutCollectors(layouts: CollectorLayout[]): Promise<void>;

  upsertAlarm(alarm: AlarmRecord): Promise<void>;
  getActiveAlarms(): Promise<AlarmRecord[]>;
  getAlarmHistory(params: { range: 'day' | 'week' | 'month' }): Promise<AlarmEventRecord[]>;
  getAlarmById(alarmId: string): Promise<AlarmRecord | undefined>;

  appendAlarmEvent(event: AlarmEventRecord): Promise<void>;
  appendAlarmOutbox(outbox: AlarmOutbox): Promise<{ duplicate: boolean }>;

  saveNotificationTask(task: NotificationTaskRecord): Promise<{ duplicate: boolean }>;
  updateNotificationTask(taskId: string, patch: Partial<NotificationTaskRecord>): Promise<void>;

  appendRealtimeEvent(event: RealtimeEvent): Promise<void>;
  getRealtimeEventsAfter(lastEventId?: string, limit?: number): Promise<RealtimeEvent[]>;
}
