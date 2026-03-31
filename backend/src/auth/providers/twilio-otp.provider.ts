import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { OtpProvider } from '../interfaces/otp-provider.interface';
import { OtpChannel } from '../otp.service';

interface TwilioMessageResponse {
  sid?: string;
  status?: string;
  error_code?: string | null;
  error_message?: string | null;
}

@Injectable()
export class TwilioOtpProvider implements OtpProvider {
  readonly name = 'twilio';

  constructor(private readonly configService: ConfigService) {}

  supportsChannel(channel: OtpChannel): boolean {
    return channel === 'sms';
  }

  async sendOtp(params: { to: string; channel: OtpChannel; purpose: string; code: string }) {
    const accountSid = this.configService.get<string>('integrations.twilio.accountSid');
    const authToken = this.configService.get<string>('integrations.twilio.authToken');
    const fromNumber = this.configService.get<string>('integrations.twilio.fromNumber');
    const messagingServiceSid = this.configService.get<string>(
      'integrations.twilio.messagingServiceSid'
    );
    const baseUrl = this.configService.get<string>('integrations.twilio.baseUrl');
    const timeoutMs = this.configService.get<number>('integrations.twilio.timeoutMs', 10000);

    if (!accountSid || !authToken) {
      throw new ServiceUnavailableException(
        'Twilio is not configured. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.'
      );
    }
    if (!fromNumber && !messagingServiceSid) {
      throw new ServiceUnavailableException(
        'Twilio sender not configured. Set TWILIO_FROM_NUMBER or TWILIO_MESSAGING_SERVICE_SID.'
      );
    }

    const body = new URLSearchParams();
    body.set('To', this.normalizeSmsDestination(params.to));
    body.set('Body', `Your TruMonie OTP is ${params.code}. It expires in 5 minutes.`);
    if (messagingServiceSid) {
      body.set('MessagingServiceSid', messagingServiceSid);
    } else if (fromNumber) {
      body.set('From', fromNumber);
    }

    const authHeader = `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`;
    const endpoint = `${baseUrl}/2010-04-01/Accounts/${accountSid}/Messages.json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          authorization: authHeader,
          'content-type': 'application/x-www-form-urlencoded'
        },
        body: body.toString(),
        signal: controller.signal
      });

      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as TwilioMessageResponse) : {};
      if (!response.ok) {
        throw new BadGatewayException(
          `Twilio OTP request failed: ${response.status} ${response.statusText}${parsed.error_code ? ` (code: ${parsed.error_code})` : ''}${parsed.error_message ? ` - ${parsed.error_message}` : ''}`
        );
      }
      return {
        accepted: Boolean(parsed.sid && !parsed.error_code),
        reference: parsed.sid
      };
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Twilio OTP provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Twilio OTP provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private normalizeSmsDestination(destination: string): string {
    const raw = destination.trim();
    if (raw.startsWith('+')) {
      return raw;
    }

    const digits = raw.replace(/\D/g, '');
    if (digits.startsWith('0') && digits.length === 11) {
      return `+234${digits.slice(1)}`;
    }
    if (digits.startsWith('234') && digits.length === 13) {
      return `+${digits}`;
    }
    if (digits.length === 10) {
      return `+234${digits}`;
    }
    return raw;
  }
}
