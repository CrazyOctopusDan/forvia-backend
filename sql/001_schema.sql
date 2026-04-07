/* SQL Server 2019+ schema for Forvia backend */
SET ANSI_NULLS ON;
SET QUOTED_IDENTIFIER ON;
GO

IF NOT EXISTS (SELECT 1 FROM sys.schemas WHERE name = 'dbo') EXEC('CREATE SCHEMA dbo');
GO

CREATE TABLE dbo.metric_samples_minute (
  id bigint IDENTITY(1,1) NOT NULL,
  collector_id nvarchar(64) NOT NULL,
  metric_type nvarchar(8) NOT NULL,
  ts datetime2(3) NOT NULL,
  value decimal(10,3) NOT NULL,
  quality nvarchar(16) NULL,
  batch_id nvarchar(64) NOT NULL,
  ingested_at datetime2(3) NOT NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_metric_samples_created_at DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_metric_samples_updated_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT PK_metric_samples_minute PRIMARY KEY CLUSTERED (id),
  CONSTRAINT UQ_metric_samples_idempotent UNIQUE (collector_id, metric_type, ts, batch_id)
);
GO
CREATE INDEX IX_metric_samples_collector_metric_ts ON dbo.metric_samples_minute (collector_id, metric_type, ts DESC);
CREATE INDEX IX_metric_samples_ts ON dbo.metric_samples_minute (ts);
GO

CREATE TABLE dbo.collector_thresholds (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  collector_id nvarchar(64) NOT NULL,
  temp_warn decimal(10,3) NOT NULL,
  temp_alarm decimal(10,3) NOT NULL,
  vib_warn decimal(10,3) NOT NULL,
  vib_alarm decimal(10,3) NOT NULL,
  updated_by nvarchar(64) NOT NULL,
  updated_at datetime2(3) NOT NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_collector_thresholds_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_collector_thresholds_collector UNIQUE (collector_id)
);
GO

CREATE TABLE dbo.threshold_audit_log (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  operator nvarchar(64) NOT NULL,
  action_type nvarchar(32) NOT NULL,
  source_collector_id nvarchar(64) NULL,
  target_collector_id nvarchar(64) NULL,
  payload nvarchar(max) NULL,
  created_at datetime2(3) NOT NULL
);
GO
CREATE INDEX IX_threshold_audit_log_created_at ON dbo.threshold_audit_log (created_at DESC);
GO

CREATE TABLE dbo.collector_layout (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  collector_id nvarchar(64) NOT NULL,
  x decimal(10,3) NOT NULL,
  y decimal(10,3) NOT NULL,
  z_index int NOT NULL DEFAULT 0,
  zone nvarchar(64) NOT NULL,
  version_no int NOT NULL DEFAULT 1,
  updated_by nvarchar(64) NOT NULL,
  updated_at datetime2(3) NOT NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_collector_layout_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_collector_layout_collector UNIQUE (collector_id)
);
GO
CREATE INDEX IX_collector_layout_zone ON dbo.collector_layout (zone);
GO

CREATE TABLE dbo.alarms (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  alarm_id nvarchar(64) NOT NULL,
  collector_id nvarchar(64) NOT NULL,
  metric_type nvarchar(8) NOT NULL,
  level nvarchar(16) NOT NULL,
  status nvarchar(16) NOT NULL,
  first_triggered_at datetime2(3) NOT NULL,
  last_changed_at datetime2(3) NOT NULL,
  acked_by nvarchar(64) NULL,
  acked_at datetime2(3) NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_alarms_created_at DEFAULT SYSUTCDATETIME(),
  updated_at datetime2(3) NOT NULL CONSTRAINT DF_alarms_updated_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_alarms_alarm_id UNIQUE (alarm_id)
);
GO
CREATE INDEX IX_alarms_status_last_changed ON dbo.alarms (status, last_changed_at DESC);
GO

CREATE TABLE dbo.alarm_events (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  event_id nvarchar(64) NOT NULL,
  alarm_id nvarchar(64) NOT NULL,
  collector_id nvarchar(64) NOT NULL,
  metric_type nvarchar(8) NOT NULL,
  level nvarchar(16) NOT NULL,
  status nvarchar(16) NOT NULL,
  actual_value decimal(10,3) NOT NULL,
  threshold_value decimal(10,3) NOT NULL,
  occurred_at datetime2(3) NOT NULL,
  source nvarchar(32) NOT NULL,
  created_at datetime2(3) NOT NULL CONSTRAINT DF_alarm_events_created_at DEFAULT SYSUTCDATETIME(),
  CONSTRAINT UQ_alarm_events_event_id UNIQUE (event_id)
);
GO
CREATE INDEX IX_alarm_events_alarm_time ON dbo.alarm_events (alarm_id, occurred_at DESC);
GO

CREATE TABLE dbo.alarm_outbox (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  event_id nvarchar(64) NOT NULL,
  payload nvarchar(max) NOT NULL,
  dispatch_status nvarchar(16) NOT NULL DEFAULT 'pending',
  retry_count int NOT NULL DEFAULT 0,
  next_retry_at datetime2(3) NULL,
  created_at datetime2(3) NOT NULL,
  updated_at datetime2(3) NOT NULL,
  CONSTRAINT UQ_alarm_outbox_event_id UNIQUE (event_id)
);
GO
CREATE INDEX IX_alarm_outbox_status_next_retry ON dbo.alarm_outbox (dispatch_status, next_retry_at);
GO

CREATE TABLE dbo.notification_tasks (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  task_id nvarchar(64) NOT NULL,
  event_id nvarchar(64) NOT NULL,
  channel nvarchar(16) NOT NULL,
  target nvarchar(256) NOT NULL,
  status nvarchar(16) NOT NULL,
  retry_count int NOT NULL DEFAULT 0,
  next_retry_at datetime2(3) NULL,
  last_error nvarchar(512) NULL,
  created_at datetime2(3) NOT NULL,
  updated_at datetime2(3) NOT NULL,
  CONSTRAINT UQ_notification_tasks_task_id UNIQUE (task_id)
);
GO
CREATE INDEX IX_notification_tasks_status_retry ON dbo.notification_tasks (status, next_retry_at);
CREATE INDEX IX_notification_tasks_event_id ON dbo.notification_tasks (event_id);
GO

CREATE TABLE dbo.collector_latest_status (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  collector_id nvarchar(64) NOT NULL,
  temp_value decimal(10,3) NULL,
  vib_value decimal(10,3) NULL,
  status nvarchar(16) NOT NULL,
  alarm_level nvarchar(16) NULL,
  updated_at datetime2(3) NOT NULL,
  CONSTRAINT UQ_collector_latest_status_collector UNIQUE (collector_id)
);
GO
CREATE INDEX IX_collector_latest_status_status_updated ON dbo.collector_latest_status (status, updated_at DESC);
GO

CREATE TABLE dbo.metric_agg_day (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  collector_id nvarchar(64) NOT NULL,
  metric_type nvarchar(8) NOT NULL,
  stat_date date NOT NULL,
  min_value decimal(10,3) NOT NULL,
  max_value decimal(10,3) NOT NULL,
  avg_value decimal(10,3) NOT NULL,
  sample_count int NOT NULL,
  CONSTRAINT UQ_metric_agg_day UNIQUE (collector_id, metric_type, stat_date)
);
GO

CREATE TABLE dbo.metric_agg_week (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  collector_id nvarchar(64) NOT NULL,
  metric_type nvarchar(8) NOT NULL,
  week_start date NOT NULL,
  min_value decimal(10,3) NOT NULL,
  max_value decimal(10,3) NOT NULL,
  avg_value decimal(10,3) NOT NULL,
  sample_count int NOT NULL,
  CONSTRAINT UQ_metric_agg_week UNIQUE (collector_id, metric_type, week_start)
);
GO

CREATE TABLE dbo.metric_agg_month (
  id bigint IDENTITY(1,1) PRIMARY KEY,
  collector_id nvarchar(64) NOT NULL,
  metric_type nvarchar(8) NOT NULL,
  month_start date NOT NULL,
  min_value decimal(10,3) NOT NULL,
  max_value decimal(10,3) NOT NULL,
  avg_value decimal(10,3) NOT NULL,
  sample_count int NOT NULL,
  CONSTRAINT UQ_metric_agg_month UNIQUE (collector_id, metric_type, month_start)
);
GO
