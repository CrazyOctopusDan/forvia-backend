import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { randomUUID } from 'node:crypto';
import { AppLogger } from '../logger/app-logger.service.js';

@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  constructor(private readonly logger: AppLogger) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{ method: string; url: string; headers: Record<string, string>; requestId?: string }>();
    const res = context.switchToHttp().getResponse<{ header: (name: string, value: string) => void; statusCode?: number }>();

    const requestId = req.headers['x-request-id'] ?? randomUUID();
    req.requestId = requestId;
    res.header('x-request-id', requestId);

    const start = Date.now();
    this.logger.info('request_in', {
      requestId,
      method: req.method,
      path: req.url,
    });

    return next.handle().pipe(
      tap({
        next: () => {
          this.logger.info('request_out', {
            requestId,
            method: req.method,
            path: req.url,
            statusCode: res.statusCode,
            latencyMs: Date.now() - start,
          });
        },
      }),
    );
  }
}
