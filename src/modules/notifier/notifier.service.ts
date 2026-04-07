import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/logger/app-logger.service.js';
import { AppError } from '../../common/utils/app-error.js';
import { NotificationTaskRecord } from '../../contracts/models.js';
import { RepositoryPort } from '../../storage/interfaces/repository.port.js';
import { REPOSITORY } from '../../storage/interfaces/repository.tokens.js';

@Injectable()
export class NotifierService {
  constructor(
    @Inject(REPOSITORY) private readonly repo: RepositoryPort,
    private readonly logger: AppLogger,
  ) {}

  async dispatchTask(task: NotificationTaskRecord) {
    const saved = await this.repo.saveNotificationTask(task);
    if (saved.duplicate) {
      throw new AppError('NOTIFICATION_SCHEMA_INVALID', `taskId ${task.taskId} already exists`, HttpStatus.CONFLICT);
    }

    this.logger.info('notification_dispatch_start', {
      taskId: task.taskId,
      channel: task.channel,
      eventId: task.eventId,
    });

    if (task.channel !== 'in_app') {
      await this.repo.updateNotificationTask(task.taskId, {
        status: 'failed',
        retryCount: task.retryCount + 1,
        lastError: 'Channel not implemented in MVP',
        nextRetryAt: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
      });
      throw new AppError('NOTIFICATION_CHANNEL_UNSUPPORTED', `channel ${task.channel} is not implemented`);
    }

    await this.repo.updateNotificationTask(task.taskId, {
      status: 'sent',
      retryCount: task.retryCount,
      nextRetryAt: undefined,
      lastError: undefined,
    });

    this.logger.info('notification_dispatch_done', {
      taskId: task.taskId,
      channel: task.channel,
      status: 'sent',
    });

    return {
      taskId: task.taskId,
      status: 'sent',
      channel: task.channel,
    };
  }
}
