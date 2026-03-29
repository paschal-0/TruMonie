import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { Currency } from '../../ledger/enums/currency.enum';
import { FxProvider } from '../interfaces/fx-provider.interface';

interface FxRatePayload {
  rate?: number | string;
  data?: FxRatePayload;
}

@Injectable()
export class LicensedFxProvider implements FxProvider {
  readonly name = 'licensed';

  constructor(private readonly configService: ConfigService) {}

  async getRate(base: Currency, quote: Currency): Promise<number | null> {
    if (base === quote) {
      return 1;
    }
    const data = await this.request<FxRatePayload>('GET', this.path(), { base, quote });
    const raw = data?.rate ?? data?.data?.rate;
    if (raw === undefined || raw === null) {
      return null;
    }
    const parsed = Number(raw);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }

  private path(): string {
    return this.configService.get<string>('integrations.licensed.fxRatePath', '');
  }

  private async request<T>(
    method: 'GET',
    path: string,
    query: Record<string, string>
  ): Promise<T> {
    const baseUrl = this.configService.get<string>('integrations.licensed.baseUrl');
    const apiKey = this.configService.get<string>('integrations.licensed.apiKey');
    const timeoutMs = this.configService.get<number>('integrations.licensed.timeoutMs', 10000);

    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException(
        'Licensed infrastructure is not configured. Set LICENSED_INFRA_BASE_URL and LICENSED_INFRA_API_KEY.'
      );
    }
    if (!path) {
      throw new ServiceUnavailableException('Licensed FX endpoint path is not configured.');
    }

    const url = new URL(path, baseUrl);
    Object.entries(query).forEach(([key, value]) => url.searchParams.set(key, value));

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url.toString(), {
        method,
        headers: {
          authorization: `Bearer ${apiKey}`
        },
        signal: controller.signal
      });
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new BadGatewayException(
          `Licensed FX provider request failed: ${response.status} ${response.statusText}`
        );
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Licensed FX provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Licensed FX provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
