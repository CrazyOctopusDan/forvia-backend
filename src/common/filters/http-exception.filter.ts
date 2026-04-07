import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FastifyReply, FastifyRequest } from 'fastify';
import { AppLogger } from '../logger/app-logger.service.js';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  constructor(private readonly logger: AppLogger) {}

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest & { requestId?: string }>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let code = 'INTERNAL_ERROR';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const payload = exception.getResponse() as
        | string
        | { message?: string | string[]; code?: string };
      if (typeof payload === 'string') {
        message = payload;
      } else {
        if (payload.message) {
          message = Array.isArray(payload.message) ? payload.message.join('; ') : payload.message;
        }
        if (payload.code) {
          code = payload.code;
        }
      }
    }

    this.logger.error('request_failed', {
      requestId: request.requestId,
      method: request.method,
      path: request.url,
      status,
      code,
      message,
    });

    response.status(status).send({
      code,
      message,
      requestId: request.requestId,
    });
  }
}
