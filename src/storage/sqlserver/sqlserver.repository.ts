import { Injectable } from '@nestjs/common';
import sql from 'mssql';
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
import { SqlServerClient } from './sqlserver.client.js';

@Injectable()
export class SqlServerRepository implements RepositoryPort {
  constructor(private readonly client: SqlServerClient) {}

  async ping(): Promise<boolean> {
    const pool = await this.client.getPool();
    const result = await pool.request().query('SELECT 1 AS ok');
    return result.recordset[0]?.ok === 1;
  }

  async saveMetricBatch(batch: IngestBatch): Promise<{ inserted: number; duplicate: boolean }> {
    const pool = await this.client.getPool();
    let inserted = 0;

    for (const point of batch.points) {
      const req = pool.request();
      req.input('collector_id', sql.NVarChar(64), batch.collectorId);
      req.input('metric_type', sql.NVarChar(8), point.metricType);
      req.input('ts', sql.DateTime2, new Date(point.ts));
      req.input('value', sql.Decimal(10, 3), point.value);
      req.input('quality', sql.NVarChar(16), point.quality ?? null);
      req.input('batch_id', sql.NVarChar(64), batch.batchId);
      req.input('ingested_at', sql.DateTime2, new Date());

      const result = await req.query(`
IF NOT EXISTS (
  SELECT 1 FROM dbo.metric_samples_minute
  WHERE collector_id=@collector_id AND metric_type=@metric_type AND ts=@ts AND batch_id=@batch_id
)
BEGIN
  INSERT INTO dbo.metric_samples_minute (collector_id, metric_type, ts, value, quality, batch_id, ingested_at)
  VALUES (@collector_id, @metric_type, @ts, @value, @quality, @batch_id, @ingested_at);
  SELECT 1 AS inserted;
END
ELSE
BEGIN
  SELECT 0 AS inserted;
END
`);

      if (result.recordset[0]?.inserted === 1) {
        inserted += 1;
      }

      await pool.request()
        .input('collector_id', sql.NVarChar(64), batch.collectorId)
        .input('metric_type', sql.NVarChar(8), point.metricType)
        .input('value', sql.Decimal(10, 3), point.value)
        .input('updated_at', sql.DateTime2, new Date(point.ts))
        .query(`
MERGE dbo.collector_latest_status AS target
USING (SELECT @collector_id AS collector_id) AS src
ON target.collector_id = src.collector_id
WHEN MATCHED THEN
  UPDATE SET
    temp_value = CASE WHEN @metric_type='temp' THEN @value ELSE target.temp_value END,
    vib_value = CASE WHEN @metric_type='vib' THEN @value ELSE target.vib_value END,
    updated_at = @updated_at
WHEN NOT MATCHED THEN
  INSERT (collector_id, temp_value, vib_value, status, alarm_level, updated_at)
  VALUES (
    @collector_id,
    CASE WHEN @metric_type='temp' THEN @value ELSE NULL END,
    CASE WHEN @metric_type='vib' THEN @value ELSE NULL END,
    'NORMAL',
    NULL,
    @updated_at
  );
`);
    }

    return { inserted, duplicate: inserted === 0 };
  }

  async queryLatestByCollectors(): Promise<CollectorLatestStatus[]> {
    return this.queryCollectorRealtime();
  }

  async queryCollectorRealtime(collectorIds?: string[]): Promise<CollectorLatestStatus[]> {
    const pool = await this.client.getPool();
    let query = `SELECT collector_id, temp_value, vib_value, status, alarm_level, updated_at FROM dbo.collector_latest_status`;
    if (collectorIds && collectorIds.length > 0) {
      const inList = collectorIds.map((_, i) => `@id${i}`).join(',');
      query += ` WHERE collector_id IN (${inList})`;
    }

    const req = pool.request();
    collectorIds?.forEach((id, i) => req.input(`id${i}`, sql.NVarChar(64), id));
    const result = await req.query(query);

    return result.recordset.map((r: any) => ({
      collectorId: r.collector_id,
      tempValue: r.temp_value === null ? undefined : Number(r.temp_value),
      vibValue: r.vib_value === null ? undefined : Number(r.vib_value),
      status: r.status,
      alarmLevel: r.alarm_level ?? undefined,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async queryCollectorHistory(params: {
    collectorId: string;
    metric: 'temp' | 'vib';
    range: 'day' | 'week' | 'month';
    from?: string;
    to?: string;
  }): Promise<MetricHistoryPoint[]> {
    const pool = await this.client.getPool();
    const table = params.range === 'day' ? 'metric_agg_day' : params.range === 'week' ? 'metric_agg_week' : 'metric_agg_month';
    const key = params.range === 'day' ? 'stat_date' : params.range === 'week' ? 'week_start' : 'month_start';

    const result = await pool.request()
      .input('collector_id', sql.NVarChar(64), params.collectorId)
      .input('metric_type', sql.NVarChar(8), params.metric)
      .query(`
SELECT ${key} AS time_key, min_value, max_value, avg_value, sample_count
FROM dbo.${table}
WHERE collector_id=@collector_id AND metric_type=@metric_type
ORDER BY ${key} ASC
`);

    return result.recordset.map((r: any) => ({
      timeKey: typeof r.time_key === 'string' ? r.time_key : new Date(r.time_key).toISOString().slice(0, 10),
      minValue: Number(r.min_value),
      maxValue: Number(r.max_value),
      avgValue: Number(r.avg_value),
      sampleCount: Number(r.sample_count),
    }));
  }

  async getThresholds(): Promise<Threshold[]> {
    const pool = await this.client.getPool();
    const result = await pool.request().query(`
SELECT collector_id, temp_warn, temp_alarm, vib_warn, vib_alarm, updated_by, updated_at
FROM dbo.collector_thresholds
ORDER BY collector_id ASC
`);
    return result.recordset.map((r: any) => ({
      collectorId: r.collector_id,
      tempWarn: Number(r.temp_warn),
      tempAlarm: Number(r.temp_alarm),
      vibWarn: Number(r.vib_warn),
      vibAlarm: Number(r.vib_alarm),
      updatedBy: r.updated_by,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async getThreshold(collectorId: string): Promise<Threshold | undefined> {
    const pool = await this.client.getPool();
    const result = await pool.request()
      .input('collector_id', sql.NVarChar(64), collectorId)
      .query(`
SELECT collector_id, temp_warn, temp_alarm, vib_warn, vib_alarm, updated_by, updated_at
FROM dbo.collector_thresholds
WHERE collector_id=@collector_id
`);
    const row = result.recordset[0];
    if (!row) {
      return undefined;
    }
    return {
      collectorId: row.collector_id,
      tempWarn: Number(row.temp_warn),
      tempAlarm: Number(row.temp_alarm),
      vibWarn: Number(row.vib_warn),
      vibAlarm: Number(row.vib_alarm),
      updatedBy: row.updated_by,
      updatedAt: new Date(row.updated_at).toISOString(),
    };
  }

  async upsertThreshold(threshold: Threshold): Promise<void> {
    const pool = await this.client.getPool();
    await pool.request()
      .input('collector_id', sql.NVarChar(64), threshold.collectorId)
      .input('temp_warn', sql.Decimal(10, 3), threshold.tempWarn)
      .input('temp_alarm', sql.Decimal(10, 3), threshold.tempAlarm)
      .input('vib_warn', sql.Decimal(10, 3), threshold.vibWarn)
      .input('vib_alarm', sql.Decimal(10, 3), threshold.vibAlarm)
      .input('updated_by', sql.NVarChar(64), threshold.updatedBy)
      .input('updated_at', sql.DateTime2, new Date(threshold.updatedAt))
      .query(`
MERGE dbo.collector_thresholds AS target
USING (SELECT @collector_id AS collector_id) AS src
ON target.collector_id = src.collector_id
WHEN MATCHED THEN
  UPDATE SET temp_warn=@temp_warn, temp_alarm=@temp_alarm, vib_warn=@vib_warn, vib_alarm=@vib_alarm, updated_by=@updated_by, updated_at=@updated_at
WHEN NOT MATCHED THEN
  INSERT (collector_id, temp_warn, temp_alarm, vib_warn, vib_alarm, updated_by, updated_at)
  VALUES (@collector_id, @temp_warn, @temp_alarm, @vib_warn, @vib_alarm, @updated_by, @updated_at);
`);
  }

  async appendThresholdAudit(record: {
    operator: string;
    actionType: string;
    sourceCollectorId?: string;
    targetCollectorId?: string;
    payload: string;
    createdAt: string;
  }): Promise<void> {
    const pool = await this.client.getPool();
    await pool.request()
      .input('operator', sql.NVarChar(64), record.operator)
      .input('action_type', sql.NVarChar(32), record.actionType)
      .input('source_collector_id', sql.NVarChar(64), record.sourceCollectorId ?? null)
      .input('target_collector_id', sql.NVarChar(64), record.targetCollectorId ?? null)
      .input('payload', sql.NVarChar(sql.MAX), record.payload)
      .input('created_at', sql.DateTime2, new Date(record.createdAt))
      .query(`
INSERT INTO dbo.threshold_audit_log (operator, action_type, source_collector_id, target_collector_id, payload, created_at)
VALUES (@operator, @action_type, @source_collector_id, @target_collector_id, @payload, @created_at)
`);
  }

  async getLayoutCollectors(): Promise<CollectorLayout[]> {
    const pool = await this.client.getPool();
    const result = await pool.request().query(`
SELECT collector_id, x, y, z_index, zone, version_no, updated_by, updated_at
FROM dbo.collector_layout
ORDER BY collector_id ASC
`);
    return result.recordset.map((r: any) => ({
      collectorId: r.collector_id,
      x: Number(r.x),
      y: Number(r.y),
      zIndex: Number(r.z_index),
      zone: r.zone,
      versionNo: Number(r.version_no),
      updatedBy: r.updated_by,
      updatedAt: new Date(r.updated_at).toISOString(),
    }));
  }

  async replaceLayoutCollectors(layouts: CollectorLayout[]): Promise<void> {
    const pool = await this.client.getPool();
    const tx = new sql.Transaction(pool);
    await tx.begin();
    try {
      await tx.request().query('DELETE FROM dbo.collector_layout');
      for (const l of layouts) {
        await tx.request()
          .input('collector_id', sql.NVarChar(64), l.collectorId)
          .input('x', sql.Decimal(10, 3), l.x)
          .input('y', sql.Decimal(10, 3), l.y)
          .input('z_index', sql.Int, l.zIndex)
          .input('zone', sql.NVarChar(64), l.zone)
          .input('version_no', sql.Int, l.versionNo)
          .input('updated_by', sql.NVarChar(64), l.updatedBy)
          .input('updated_at', sql.DateTime2, new Date(l.updatedAt))
          .query(`
INSERT INTO dbo.collector_layout (collector_id, x, y, z_index, zone, version_no, updated_by, updated_at)
VALUES (@collector_id, @x, @y, @z_index, @zone, @version_no, @updated_by, @updated_at)
`);
      }
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  }

  async upsertAlarm(alarm: AlarmRecord): Promise<void> {
    const pool = await this.client.getPool();
    await pool.request()
      .input('alarm_id', sql.NVarChar(64), alarm.alarmId)
      .input('collector_id', sql.NVarChar(64), alarm.collectorId)
      .input('metric_type', sql.NVarChar(8), alarm.metricType)
      .input('level', sql.NVarChar(16), alarm.level)
      .input('status', sql.NVarChar(16), alarm.status)
      .input('first_triggered_at', sql.DateTime2, new Date(alarm.firstTriggeredAt))
      .input('last_changed_at', sql.DateTime2, new Date(alarm.lastChangedAt))
      .input('acked_by', sql.NVarChar(64), alarm.ackedBy ?? null)
      .input('acked_at', sql.DateTime2, alarm.ackedAt ? new Date(alarm.ackedAt) : null)
      .query(`
MERGE dbo.alarms AS target
USING (SELECT @alarm_id AS alarm_id) AS src
ON target.alarm_id = src.alarm_id
WHEN MATCHED THEN
  UPDATE SET level=@level, status=@status, last_changed_at=@last_changed_at, acked_by=@acked_by, acked_at=@acked_at
WHEN NOT MATCHED THEN
  INSERT (alarm_id, collector_id, metric_type, level, status, first_triggered_at, last_changed_at, acked_by, acked_at)
  VALUES (@alarm_id, @collector_id, @metric_type, @level, @status, @first_triggered_at, @last_changed_at, @acked_by, @acked_at);
`);
  }

  async getActiveAlarms(): Promise<AlarmRecord[]> {
    const pool = await this.client.getPool();
    const result = await pool.request().query(`
SELECT alarm_id, collector_id, metric_type, level, status, first_triggered_at, last_changed_at, acked_by, acked_at
FROM dbo.alarms
WHERE status IN ('WARN','ALARM','ACKED')
ORDER BY last_changed_at DESC
`);
    return result.recordset.map((r: any) => ({
      alarmId: r.alarm_id,
      collectorId: r.collector_id,
      metricType: r.metric_type,
      level: r.level,
      status: r.status,
      firstTriggeredAt: new Date(r.first_triggered_at).toISOString(),
      lastChangedAt: new Date(r.last_changed_at).toISOString(),
      ackedBy: r.acked_by ?? undefined,
      ackedAt: r.acked_at ? new Date(r.acked_at).toISOString() : undefined,
    }));
  }

  async getAlarmHistory(_params: { range: 'day' | 'week' | 'month' }): Promise<AlarmEventRecord[]> {
    const pool = await this.client.getPool();
    const result = await pool.request().query(`
SELECT event_id, alarm_id, collector_id, metric_type, level, status, actual_value, threshold_value, occurred_at, source
FROM dbo.alarm_events
ORDER BY occurred_at DESC
`);
    return result.recordset.map((r: any) => ({
      eventId: r.event_id,
      alarmId: r.alarm_id,
      collectorId: r.collector_id,
      metricType: r.metric_type,
      level: r.level,
      status: r.status,
      actualValue: Number(r.actual_value),
      thresholdValue: Number(r.threshold_value),
      occurredAt: new Date(r.occurred_at).toISOString(),
      source: r.source,
    }));
  }

  async getAlarmById(alarmId: string): Promise<AlarmRecord | undefined> {
    const pool = await this.client.getPool();
    const result = await pool.request()
      .input('alarm_id', sql.NVarChar(64), alarmId)
      .query(`
SELECT alarm_id, collector_id, metric_type, level, status, first_triggered_at, last_changed_at, acked_by, acked_at
FROM dbo.alarms
WHERE alarm_id=@alarm_id
`);
    const r = result.recordset[0];
    if (!r) {
      return undefined;
    }
    return {
      alarmId: r.alarm_id,
      collectorId: r.collector_id,
      metricType: r.metric_type,
      level: r.level,
      status: r.status,
      firstTriggeredAt: new Date(r.first_triggered_at).toISOString(),
      lastChangedAt: new Date(r.last_changed_at).toISOString(),
      ackedBy: r.acked_by ?? undefined,
      ackedAt: r.acked_at ? new Date(r.acked_at).toISOString() : undefined,
    };
  }

  async appendAlarmEvent(event: AlarmEventRecord): Promise<void> {
    const pool = await this.client.getPool();
    await pool.request()
      .input('event_id', sql.NVarChar(64), event.eventId)
      .input('alarm_id', sql.NVarChar(64), event.alarmId)
      .input('collector_id', sql.NVarChar(64), event.collectorId)
      .input('metric_type', sql.NVarChar(8), event.metricType)
      .input('level', sql.NVarChar(16), event.level)
      .input('status', sql.NVarChar(16), event.status)
      .input('actual_value', sql.Decimal(10, 3), event.actualValue)
      .input('threshold_value', sql.Decimal(10, 3), event.thresholdValue)
      .input('occurred_at', sql.DateTime2, new Date(event.occurredAt))
      .input('source', sql.NVarChar(32), event.source)
      .query(`
IF NOT EXISTS (SELECT 1 FROM dbo.alarm_events WHERE event_id=@event_id)
BEGIN
  INSERT INTO dbo.alarm_events (event_id, alarm_id, collector_id, metric_type, level, status, actual_value, threshold_value, occurred_at, source)
  VALUES (@event_id, @alarm_id, @collector_id, @metric_type, @level, @status, @actual_value, @threshold_value, @occurred_at, @source)
END
`);
  }

  async appendAlarmOutbox(outbox: AlarmOutbox): Promise<{ duplicate: boolean }> {
    const pool = await this.client.getPool();
    const result = await pool.request()
      .input('event_id', sql.NVarChar(64), outbox.eventId)
      .input('payload', sql.NVarChar(sql.MAX), outbox.payload)
      .input('dispatch_status', sql.NVarChar(16), outbox.dispatchStatus)
      .input('retry_count', sql.Int, outbox.retryCount)
      .input('next_retry_at', sql.DateTime2, outbox.nextRetryAt ? new Date(outbox.nextRetryAt) : null)
      .input('created_at', sql.DateTime2, new Date(outbox.createdAt))
      .input('updated_at', sql.DateTime2, new Date(outbox.updatedAt))
      .query(`
IF EXISTS (SELECT 1 FROM dbo.alarm_outbox WHERE event_id=@event_id)
BEGIN
  SELECT 1 AS duplicate;
END
ELSE
BEGIN
  INSERT INTO dbo.alarm_outbox (event_id, payload, dispatch_status, retry_count, next_retry_at, created_at, updated_at)
  VALUES (@event_id, @payload, @dispatch_status, @retry_count, @next_retry_at, @created_at, @updated_at);
  SELECT 0 AS duplicate;
END
`);
    return { duplicate: result.recordset[0]?.duplicate === 1 };
  }

  async saveNotificationTask(task: NotificationTaskRecord): Promise<{ duplicate: boolean }> {
    const pool = await this.client.getPool();
    const result = await pool.request()
      .input('task_id', sql.NVarChar(64), task.taskId)
      .input('event_id', sql.NVarChar(64), task.eventId)
      .input('channel', sql.NVarChar(16), task.channel)
      .input('target', sql.NVarChar(256), task.target)
      .input('status', sql.NVarChar(16), task.status)
      .input('retry_count', sql.Int, task.retryCount)
      .input('next_retry_at', sql.DateTime2, task.nextRetryAt ? new Date(task.nextRetryAt) : null)
      .input('last_error', sql.NVarChar(512), task.lastError ?? null)
      .input('created_at', sql.DateTime2, new Date(task.createdAt))
      .input('updated_at', sql.DateTime2, new Date(task.updatedAt))
      .query(`
IF EXISTS (SELECT 1 FROM dbo.notification_tasks WHERE task_id=@task_id)
BEGIN
  SELECT 1 AS duplicate;
END
ELSE
BEGIN
  INSERT INTO dbo.notification_tasks (task_id, event_id, channel, target, status, retry_count, next_retry_at, last_error, created_at, updated_at)
  VALUES (@task_id, @event_id, @channel, @target, @status, @retry_count, @next_retry_at, @last_error, @created_at, @updated_at);
  SELECT 0 AS duplicate;
END
`);

    return { duplicate: result.recordset[0]?.duplicate === 1 };
  }

  async updateNotificationTask(taskId: string, patch: Partial<NotificationTaskRecord>): Promise<void> {
    const pool = await this.client.getPool();
    await pool.request()
      .input('task_id', sql.NVarChar(64), taskId)
      .input('status', sql.NVarChar(16), patch.status ?? null)
      .input('retry_count', sql.Int, patch.retryCount ?? null)
      .input('next_retry_at', sql.DateTime2, patch.nextRetryAt ? new Date(patch.nextRetryAt) : null)
      .input('last_error', sql.NVarChar(512), patch.lastError ?? null)
      .query(`
UPDATE dbo.notification_tasks
SET
  status = COALESCE(@status, status),
  retry_count = COALESCE(@retry_count, retry_count),
  next_retry_at = COALESCE(@next_retry_at, next_retry_at),
  last_error = COALESCE(@last_error, last_error),
  updated_at = SYSUTCDATETIME()
WHERE task_id=@task_id
`);
  }

  async appendRealtimeEvent(event: RealtimeEvent): Promise<void> {
    const pool = await this.client.getPool();
    await pool.request()
      .input('event_id', sql.NVarChar(64), event.id)
      .input('payload', sql.NVarChar(sql.MAX), JSON.stringify(event))
      .input('dispatch_status', sql.NVarChar(16), 'pending')
      .input('retry_count', sql.Int, 0)
      .input('created_at', sql.DateTime2, new Date(event.sentAt))
      .input('updated_at', sql.DateTime2, new Date(event.sentAt))
      .query(`
IF NOT EXISTS (SELECT 1 FROM dbo.alarm_outbox WHERE event_id=@event_id)
BEGIN
  INSERT INTO dbo.alarm_outbox (event_id, payload, dispatch_status, retry_count, created_at, updated_at)
  VALUES (@event_id, @payload, @dispatch_status, @retry_count, @created_at, @updated_at)
END
`);
  }

  async getRealtimeEventsAfter(lastEventId?: string, limit = 200): Promise<RealtimeEvent[]> {
    const pool = await this.client.getPool();
    const req = pool.request();
    req.input('limit', sql.Int, limit);

    let query = `
SELECT TOP (@limit) event_id, payload
FROM dbo.alarm_outbox
`;
    if (lastEventId) {
      query += `WHERE id > (SELECT TOP 1 id FROM dbo.alarm_outbox WHERE event_id=@last_event_id)\n`;
      req.input('last_event_id', sql.NVarChar(64), lastEventId);
    }
    query += 'ORDER BY id ASC';

    const result = await req.query(query);
    return result.recordset
      .map((r: any) => {
        try {
          return JSON.parse(r.payload) as RealtimeEvent;
        } catch {
          return undefined;
        }
      })
      .filter((x: RealtimeEvent | undefined): x is RealtimeEvent => !!x);
  }
}
