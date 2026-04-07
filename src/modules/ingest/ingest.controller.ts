import { Body, Controller, Post } from '@nestjs/common';
import { IngestService } from './ingest.service.js';
import { IngestBatchDto } from './dto/ingest-batch.dto.js';

@Controller('/ingest')
export class IngestController {
  constructor(private readonly ingestService: IngestService) {}

  @Post('/metrics/batch')
  async ingestBatch(@Body() body: IngestBatchDto) {
    const data = await this.ingestService.ingestBatch(body);
    return {
      code: body.points.length > 0 ? 'OK' : 'INGEST_SCHEMA_INVALID',
      message: 'ingest accepted',
      data,
    };
  }
}
