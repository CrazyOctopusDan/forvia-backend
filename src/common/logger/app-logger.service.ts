import { Injectable } from '@nestjs/common';

@Injectable()
export class AppLogger {
  private emit(level: 'info' | 'error' | 'warn', event: string, meta?: Record<string, unknown>) {
    const record = {
      ts: new Date().toISOString(),
      level,
      event,
      ...meta,
    };

    if (level === 'error') {
      console.error(JSON.stringify(record));
      return;
    }
    console.log(JSON.stringify(record));
  }

  info(event: string, meta?: Record<string, unknown>) {
    this.emit('info', event, meta);
  }

  warn(event: string, meta?: Record<string, unknown>) {
    this.emit('warn', event, meta);
  }

  error(event: string, meta?: Record<string, unknown>) {
    this.emit('error', event, meta);
  }
}
