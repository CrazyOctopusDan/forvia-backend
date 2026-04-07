export type MetricType = 'temp' | 'vib';
export type AlarmLevel = 'warn' | 'alarm';
export type AlarmStatus = 'NORMAL' | 'WARN' | 'ALARM' | 'RECOVERED' | 'ACKED' | 'IGNORED';
export type NotificationChannel = 'in_app' | 'sms' | 'email' | 'wecom' | 'webhook';
export type NotificationStatus = 'pending' | 'sent' | 'failed' | 'canceled';

export interface MetricPoint {
  metricType: MetricType;
  ts: string;
  value: number;
  quality?: string;
}

export interface IngestBatch {
  batchId: string;
  collectorId: string;
  sentAt: string;
  points: MetricPoint[];
}

export interface Threshold {
  collectorId: string;
  tempWarn: number;
  tempAlarm: number;
  vibWarn: number;
  vibAlarm: number;
  updatedBy: string;
  updatedAt: string;
}

export interface CollectorLayout {
  collectorId: string;
  x: number;
  y: number;
  zIndex: number;
  zone: string;
  versionNo: number;
  updatedBy: string;
  updatedAt: string;
}

export interface AlarmRecord {
  alarmId: string;
  collectorId: string;
  metricType: MetricType;
  level: AlarmLevel;
  status: AlarmStatus;
  firstTriggeredAt: string;
  lastChangedAt: string;
  ackedBy?: string;
  ackedAt?: string;
}

export interface AlarmEventRecord {
  eventId: string;
  alarmId: string;
  collectorId: string;
  metricType: MetricType;
  level: AlarmLevel;
  status: AlarmStatus;
  actualValue: number;
  thresholdValue: number;
  occurredAt: string;
  source: 'alarm-engine' | 'external' | 'manual';
  payload?: Record<string, unknown>;
}

export interface AlarmOutbox {
  eventId: string;
  payload: string;
  dispatchStatus: 'pending' | 'dispatched' | 'failed';
  retryCount: number;
  nextRetryAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationTaskRecord {
  taskId: string;
  eventId: string;
  channel: NotificationChannel;
  target: string;
  status: NotificationStatus;
  retryCount: number;
  nextRetryAt?: string;
  lastError?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollectorLatestStatus {
  collectorId: string;
  tempValue?: number;
  vibValue?: number;
  status: AlarmStatus;
  alarmLevel?: AlarmLevel;
  updatedAt: string;
}

export interface RealtimeEvent {
  id: string;
  event: 'collector-status' | 'alarm-change' | 'heartbeat';
  data: Record<string, unknown>;
  sentAt: string;
}

export interface MetricHistoryPoint {
  timeKey: string;
  minValue: number;
  maxValue: number;
  avgValue: number;
  sampleCount: number;
}
