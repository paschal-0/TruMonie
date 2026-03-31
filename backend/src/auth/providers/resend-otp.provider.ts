import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OtpProvider } from '../interfaces/otp-provider.interface';
import { OtpChannel } from '../otp.service';

interface ResendEmailResponse {
  id?: string;
  message?: string;
  statusCode?: number;
  name?: string;
}

@Injectable()
export class ResendOtpProvider implements OtpProvider {
  readonly name = 'resend';

  constructor(private readonly configService: ConfigService) {}

  supportsChannel(channel: OtpChannel): boolean {
    return channel === 'email';
  }

  async sendOtp(params: { to: string; channel: OtpChannel; purpose: string; code: string }) {
    const apiKey = this.configService.get<string>('integrations.resend.apiKey');
    const fromEmail = this.configService.get<string>('integrations.resend.fromEmail');
    const baseUrl = this.configService.get<string>('integrations.resend.baseUrl');
    const timeoutMs = this.configService.get<number>('integrations.resend.timeoutMs', 10000);

    if (!apiKey) {
      throw new ServiceUnavailableException('Resend is not configured. Set RESEND_API_KEY.');
    }
    if (!fromEmail) {
      throw new ServiceUnavailableException('Resend sender is not configured. Set RESEND_FROM_EMAIL.');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${baseUrl}/emails`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          from: fromEmail,
          to: [params.to],
          subject: 'Your TruMonie OTP',
          text: `Your TruMonie OTP is ${params.code}. It expires in 5 minutes.`,
          html: `<p>Your TruMonie OTP is <strong>${params.code}</strong>. It expires in 5 minutes.</p>`
        }),
        signal: controller.signal
      });

      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as ResendEmailResponse) : {};
      if (!response.ok) {
        throw new BadGatewayException(
          `Resend OTP request failed: ${response.status} ${response.statusText}${parsed.message ? ` - ${parsed.message}` : ''}`
        );
      }

      return {
        accepted: Boolean(parsed.id),
        reference: parsed.id
      };
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Resend OTP provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Resend OTP provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
