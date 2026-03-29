import { Injectable, Logger } from '@nestjs/common';

import { OtpProvider } from '../interfaces/otp-provider.interface';

@Injectable()
export class InternalOtpProvider implements OtpProvider {
  readonly name = 'internal';
  private readonly logger = new Logger(InternalOtpProvider.name);

  supportsChannel(): boolean {
    return true;
  }

  async sendOtp(params: { to: string; channel: 'sms' | 'email'; purpose: string; code: string }) {
    this.logger.log(
      `OTP dispatched via internal channel=${params.channel} to=${params.to} purpose=${params.purpose}`
    );
    return {
      accepted: true,
      reference: `INTERNAL-OTP-${Date.now()}`
    };
  }
}
