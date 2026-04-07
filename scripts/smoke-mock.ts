const base = process.env.BASE_URL ?? 'http://127.0.0.1:3000';

async function jsonRequest(path: string, options?: RequestInit) {
  const response = await fetch(`${base}${path}`, {
    headers: { 'content-type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  const body = await response.json();
  return { status: response.status, body };
}

async function run() {
  const now = Date.now();
  const batchId = `batch-${now}`;

  const ingest = await jsonRequest('/ingest/metrics/batch', {
    method: 'POST',
    body: JSON.stringify({
      batchId,
      collectorId: 'C001',
      sentAt: new Date().toISOString(),
      points: [
        { metricType: 'temp', ts: new Date().toISOString(), value: 81, quality: 'good' },
        { metricType: 'vib', ts: new Date().toISOString(), value: 35, quality: 'good' },
      ],
    }),
  });
  console.log('ingest', ingest.status, ingest.body.code);

  const snapshot = await jsonRequest('/dashboard/snapshot');
  console.log('snapshot', snapshot.status, snapshot.body.data?.kpi);

  const active = await jsonRequest('/alarms/active');
  console.log('active', active.status, active.body.data?.length);

  const alarmId = active.body.data?.[0]?.alarmId;
  if (alarmId) {
    const ack = await jsonRequest(`/alarms/${alarmId}/ack`, {
      method: 'POST',
      body: JSON.stringify({ operator: 'smoke-script' }),
    });
    console.log('ack', ack.status, ack.body.code);
  }

  const ready = await jsonRequest('/health/ready');
  console.log('ready', ready.status, ready.body.data?.checks);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
