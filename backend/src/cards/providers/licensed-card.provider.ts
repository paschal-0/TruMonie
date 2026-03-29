import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Currency } from '../../ledger/enums/currency.enum';
import { CardProvider } from '../interfaces/card-provider.interface';

interface CardPayload {
  providerReference?: string;
  reference?: string;
  last4?: string;
  data?: CardPayload;
}

@Injectable()
export class LicensedCardProvider implements CardProvider {
  readonly name = 'licensed';

  constructor(private readonly configService: ConfigService) {}

  supportsCurrency(_currency: Currency): boolean {
    return true;
  }

  async createCard(params: { userId: string; currency: Currency; fundingAccountId: string }) {
    const data = await this.request<CardPayload>('POST', this.path('cardsCreatePath'), params);
    const providerReference =
      data?.providerReference ?? data?.reference ?? data?.data?.providerReference;
    const last4 = data?.last4 ?? data?.data?.last4;
    if (!providerReference || !last4) {
      throw new BadGatewayException('Licensed cards provider returned incomplete card response');
    }
    return {
      providerReference: String(providerReference),
      last4: String(last4).slice(-4)
    };
  }

  async blockCard(params: { providerReference: string }) {
    await this.request('POST', this.path('cardsBlockPath'), params);
  }

  async unblockCard(params: { providerReference: string }) {
    await this.request('POST', this.path('cardsUnblockPath'), params);
  }

  private path(key: 'cardsCreatePath' | 'cardsBlockPath' | 'cardsUnblockPath'): string {
    return this.configService.get<string>(`integrations.licensed.${key}`, '');
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
      throw new ServiceUnavailableException('Licensed cards endpoint path is not configured.');
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
          `Licensed cards provider request failed: ${response.status} ${response.statusText}`
        );
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Licensed cards provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Licensed cards provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
