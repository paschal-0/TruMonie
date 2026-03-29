import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { BillsProvider } from '../interfaces/bills-provider.interface';

interface LicensedBillsPayload {
  code?: string;
  name?: string;
  category?: string;
  amountType?: string;
  amountMinor?: string | number;
  status?: string;
  providerReference?: string;
  reference?: string;
  metadata?: Record<string, unknown>;
  data?: LicensedBillsPayload;
}

@Injectable()
export class LicensedBillsProvider implements BillsProvider {
  readonly name = 'licensed';

  constructor(private readonly configService: ConfigService) {}

  supportsCurrency(_currency: string): boolean {
    return true;
  }

  async listCatalog() {
    const raw = await this.request<unknown>('GET', this.catalogPath());
    const payload = raw as { items?: unknown[]; data?: unknown };
    const catalog = Array.isArray(raw)
      ? raw
      : Array.isArray(payload.items)
      ? payload.items
      : Array.isArray(payload.data)
      ? payload.data
      : null;
    if (!catalog) {
      throw new BadGatewayException('Licensed bills provider returned invalid catalog');
    }
    return catalog.map((item) => {
      const entry = item as LicensedBillsPayload;
      return {
        code: String(entry.code),
        name: String(entry.name),
        category: String(entry.category ?? 'other'),
        amountType: (entry.amountType === 'fixed' ? 'fixed' : 'variable') as 'fixed' | 'variable',
        amountMinor:
          typeof entry.amountMinor === 'number'
            ? entry.amountMinor
            : entry.amountMinor
            ? parseInt(String(entry.amountMinor), 10)
            : undefined
      };
    });
  }

  async purchase(payload: {
    productCode: string;
    beneficiary: string;
    amountMinor: string;
    currency: string;
    reference: string;
  }) {
    const data = await this.request<LicensedBillsPayload>('POST', this.purchasePath(), payload);
    const rawStatus = (data?.status ?? data?.data?.status ?? 'PENDING').toString().toUpperCase();
    const status: 'PENDING' | 'SUCCESS' | 'FAILED' =
      rawStatus === 'SUCCESS' ? 'SUCCESS' : rawStatus === 'FAILED' ? 'FAILED' : 'PENDING';
    return {
      status,
      providerReference:
        data?.providerReference ?? data?.reference ?? data?.data?.providerReference ?? payload.reference,
      metadata: data?.metadata ?? data?.data?.metadata
    };
  }

  private catalogPath(): string {
    return this.configService.get<string>('integrations.licensed.billsCatalogPath', '');
  }

  private purchasePath(): string {
    return this.configService.get<string>('integrations.licensed.billsPurchasePath', '');
  }

  private async request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const baseUrl = this.configService.get<string>('integrations.licensed.baseUrl');
    const apiKey = this.configService.get<string>('integrations.licensed.apiKey');
    const timeoutMs = this.configService.get<number>('integrations.licensed.timeoutMs', 10000);

    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException(
        'Licensed infrastructure is not configured. Set LICENSED_INFRA_BASE_URL and LICENSED_INFRA_API_KEY.'
      );
    }
    if (!path) {
      throw new ServiceUnavailableException('Licensed bills endpoint path is not configured.');
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
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal
      });
      const text = await response.text();
      const parsed = text ? JSON.parse(text) : {};
      if (!response.ok) {
        throw new BadGatewayException(
          `Licensed bills provider request failed: ${response.status} ${response.statusText}`
        );
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Licensed bills provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Licensed bills provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
