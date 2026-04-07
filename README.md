# Forvia Backend (NestJS + Fastify)

Node.js 22 + TypeScript strict + NestJS + Fastify + Redis + SQL Server 双模式实现。

## 1. 功能覆盖

- 模块：`ingest` / `api-query` / `alarm-engine` / `notifier` / `sse-hub` / `config` / `health`
- 路由（无 `/v1` 前缀）：
  - `GET /dashboard/snapshot`
  - `GET /stream/collectors` (SSE)
  - `GET /collectors/realtime`
  - `GET /collectors/history`
  - `GET /alarms/active`
  - `GET /alarms/history`
  - `POST /alarms/:alarmId/ack`
  - `GET /config/layout/collectors`
  - `PUT /config/layout/collectors`
  - `GET /config/thresholds`
  - `PUT /config/thresholds/:collectorId`
  - `POST /config/thresholds/sync`
  - `POST /ingest/metrics/batch`
  - `POST /internal/alarm-events`
  - `POST /internal/notifications/dispatch`
  - `GET /health/live`
  - `GET /health/ready`

## 2. 运行模式

- `DB_MODE=mock`（默认）：无需 SQL Server，本地可完整跑通链路。
- `DB_MODE=sqlserver`：启用 SQL Server 仓储实现（当前环境未联库验证）。

## 3. 本地启动（mock 模式）

1. 准备环境

```bash
cp env.mock.example .env
```

2. 启动 Redis（推荐 docker）

```bash
docker compose up -d redis
```

3. 安装依赖

```bash
pnpm install
```

4. 启动服务

```bash
pnpm start:dev
```

5. 健康检查

```bash
curl http://127.0.0.1:3000/health/live
curl http://127.0.0.1:3000/health/ready
```

6. 冒烟脚本

```bash
pnpm smoke:mock
```

## 4. 切换到工厂数据库操作步骤

1. 复制 SQL Server 配置

```bash
cp env.sqlserver.example .env
```

2. 按工厂配置修改 `.env`：`DB_HOST/DB_PORT/DB_NAME/DB_USER/DB_PASSWORD`

3. 在 SQL Server 执行建表与作业脚本：

- `sql/001_schema.sql`
- `sql/002_partition_and_retention_job.sql`

4. 启动服务：

```bash
pnpm start:dev
```

5. 确认 `GET /health/ready` 中 `db=up`。

## 5. 联库后验收清单

- Health
  - `GET /health/live` 返回 `code=OK`
  - `GET /health/ready` 返回 `checks.db=up`
- 核心接口
  - `POST /ingest/metrics/batch` 幂等写入生效
  - `GET /dashboard/snapshot` KPI 与实时状态一致
  - `GET /alarms/active` / `GET /alarms/history` 可查
  - `POST /alarms/:alarmId/ack` 可审计
- SSE
  - `GET /stream/collectors` 建连成功
  - 心跳 15~30 秒可见
  - 带 `Last-Event-ID` 可续传
  - 断连时 `GET /collectors/realtime` 可兜底
- 报警链路
  - 超阈触发（N 次去抖）
  - 回落恢复（M 次去抖）
  - `alarm_outbox`、`notification_tasks` 有落库并更新

## 6. SQL Server 脚本说明

- `sql/001_schema.sql`
  - 核心表：
    - `metric_samples_minute`
    - `collector_thresholds`
    - `collector_layout`
    - `alarms`
    - `alarm_events`
    - `alarm_outbox`
    - `notification_tasks`
  - 附加：`collector_latest_status`、聚合表、审计表、索引、审计字段
- `sql/002_partition_and_retention_job.sql`
  - 月分区模板
  - 365 天保留清理模板
  - SQL Agent Job 样例

## 7. 关键环境变量

- `DB_MODE=mock|sqlserver`
- `ALARM_DEBOUNCE_N`（默认 2）
- `ALARM_RECOVER_M`（默认 2）
- `SSE_HEARTBEAT_MS`（默认 20000）
- `REDIS_*`
- `DB_*`（仅 sqlserver 模式）

## 8. 备注

- 当前仓库默认交付重点是 `mock` 可运行验收。
- `sqlserver` 代码与脚本已完整提供，待工厂网络与数据库可达后联调。
