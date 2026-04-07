/*
  Template for monthly partition + 365 day retention on metric_samples_minute and alarm_events.
  Run on SQL Server Agent with a daily schedule.
*/

-- 1) Create partition function/scheme sample (customize filegroups in production)
-- CREATE PARTITION FUNCTION pf_ts_monthly (datetime2(3))
-- AS RANGE RIGHT FOR VALUES ('2026-01-01', '2026-02-01', '2026-03-01');
-- GO
-- CREATE PARTITION SCHEME ps_ts_monthly
-- AS PARTITION pf_ts_monthly ALL TO ([PRIMARY]);
-- GO

-- 2) Daily retention cleanup (365 days)
DECLARE @retention datetime2(3) = DATEADD(day, -365, SYSUTCDATETIME());

DELETE TOP (50000) FROM dbo.metric_samples_minute WHERE ts < @retention;
DELETE TOP (50000) FROM dbo.alarm_events WHERE occurred_at < @retention;

-- Optional cleanup for outbox/history tables.
DELETE TOP (50000) FROM dbo.alarm_outbox
WHERE dispatch_status = 'dispatched' AND created_at < DATEADD(day, -90, SYSUTCDATETIME());

DELETE TOP (50000) FROM dbo.notification_tasks
WHERE status IN ('sent', 'canceled') AND created_at < DATEADD(day, -180, SYSUTCDATETIME());

-- 3) Update stats after cleanup.
UPDATE STATISTICS dbo.metric_samples_minute;
UPDATE STATISTICS dbo.alarm_events;
GO

/* SQL Agent Job quick template
EXEC msdb.dbo.sp_add_job @job_name = N'forvia_retention_cleanup';
EXEC msdb.dbo.sp_add_jobstep
  @job_name = N'forvia_retention_cleanup',
  @step_name = N'cleanup_365_days',
  @subsystem = N'TSQL',
  @command = N'USE [forvia_factory];\n:r C:\\sql\\002_partition_and_retention_job.sql';
*/
