import { Body, Controller, Headers, Post } from '@nestjs/common';

import { SlsgService } from './slsg.service';

@Controller('webhooks/slsg')
export class SlsgCallbackController {
  constructor(private readonly slsgService: SlsgService) {}

  @Post('status')
  statusCallback(
    @Headers('x-slsg-signature') signature: string | undefined,
    @Body()
    payload: {
      reference: string;
      status: string;
      message?: string;
    }
  ) {
    return this.slsgService.handleCallback(payload, signature);
  }
}

