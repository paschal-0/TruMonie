import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationProvider } from '../interfaces/notification-provider.interface';

interface NotificationPayload {
  delivered?: boolean;
  success?: boolean;
  reference?: string;
  data?: NotificationPayload;
}

@Injectable()
export class LicensedNotificationProvider implements NotificationProvider {
  readonly name = 'licensed';

  constructor(private readonly configService: ConfigService) {}

  async send(params: {
    userId: string;
    type: string;
    message: string;
    payload?: Record<string, unknown>;
  }) {
    const data = await this.request<NotificationPayload>('POST', this.path(), params);
    return {
      delivered: Boolean(data?.delivered ?? data?.success ?? true),
      reference: data?.reference ?? data?.data?.reference
    };
  }

  private path(): string {
    return this.configService.get<string>('integrations.licensed.notificationsSendPath', '');
  }

  private async request<T>(method: 'POST', path: string, body: unknown): Promise<T> {
    const baseUrl = this.configService.get<string>('integrations.licensed.baseUrl');
    const apiKey = this.configService.get<string>('integrations.licensed.apiKey');
    const timeoutMs = this.configService.get<number>('integrations.licensed.timeoutMs', 10000);

    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException(
        'Licensed infrastructure is not configured. Set LICENSED_INFRA_BASE_URL and LICENSED_INFRA_API_KEY.'
      );
    }
    if (!path) {
      throw new ServiceUnavailableException('Licensed notifications endpoint path is not configured.');
    }

    const url = new URL(path, baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method,
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new BadGatewayException(
          `Licensed notifications request failed: ${response.status} ${response.statusText}`
        );
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Licensed notifications provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Licensed notifications provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
