import { Body, Controller, Post } from '@nestjs/common';
import { NotifierService } from './notifier.service.js';
import { DispatchNotificationDto } from './dto/dispatch-notification.dto.js';

@Controller('/internal/notifications')
export class NotifierController {
  constructor(private readonly notifierService: NotifierService) {}

  @Post('/dispatch')
  async dispatch(@Body() body: DispatchNotificationDto) {
    const now = new Date().toISOString();
    const data = await this.notifierService.dispatchTask({
      taskId: body.taskId,
      eventId: body.eventId,
      channel: body.channel,
      target: body.target,
      status: body.status,
      retryCount: body.retryCount,
      nextRetryAt: body.nextRetryAt,
      createdAt: now,
      updatedAt: now,
    });

    return {
      code: 'OK',
      message: 'notification dispatched',
      data,
    };
  }
}
