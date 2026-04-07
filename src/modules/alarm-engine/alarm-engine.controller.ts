import { Body, Controller, Param, Post } from '@nestjs/common';
import { AlarmEngineService } from './alarm-engine.service.js';
import { AckAlarmDto } from './dto/ack-alarm.dto.js';
import { InternalAlarmEventDto } from './dto/internal-alarm-event.dto.js';

@Controller()
export class AlarmEngineController {
  constructor(private readonly alarmEngineService: AlarmEngineService) {}

  @Post('/alarms/:alarmId/ack')
  async ack(@Param('alarmId') alarmId: string, @Body() body: AckAlarmDto) {
    const data = await this.alarmEngineService.ackAlarm(alarmId, body.operator ?? 'anonymous');
    return { code: 'OK', message: 'acknowledged', data };
  }

  @Post('/internal/alarm-events')
  async ingestEvent(@Body() body: InternalAlarmEventDto) {
    const data = await this.alarmEngineService.ingestExternalEvent(body);
    return { code: 'OK', message: 'accepted', data };
  }
}
