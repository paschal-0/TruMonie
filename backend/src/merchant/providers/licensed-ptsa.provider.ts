import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  PtsaChargeParams,
  PtsaChargeResult,
  PtsaProvider,
  PtsaStatusResult
} from '../interfaces/ptsa-provider.interface';

interface LicensedPtsaPayload {
  providerReference?: string;
  reference?: string;
  status?: string;
  responseCode?: string;
  responseMessage?: string;
  authCode?: string;
  completedAt?: string;
  data?: LicensedPtsaPayload;
}

@Injectable()
export class LicensedPtsaProvider implements PtsaProvider {
  readonly name = 'licensed';

  constructor(private readonly configService: ConfigService) {}

  async charge(params: PtsaChargeParams): Promise<PtsaChargeResult> {
    const payload = await this.request<LicensedPtsaPayload>(
      this.path('ptsaChargePath'),
      params
    );
    const data = payload.data ?? payload;
    const status = this.normalizeStatus(data.status ?? 'PENDING');
    return {
      providerReference:
        data.providerReference ?? data.reference ?? `PTSA-LIC-${Date.now()}`,
      status,
      responseCode: data.responseCode,
      responseMessage: data.responseMessage,
      authCode: data.authCode
    };
  }

  async queryStatus(params: {
    reference: string;
    providerReference?: string;
  }): Promise<PtsaStatusResult> {
    const payload = await this.request<LicensedPtsaPayload>(
      this.path('ptsaStatusPath'),
      params
    );
    const data = payload.data ?? payload;
    return {
      status: this.normalizeStatus(data.status ?? 'PENDING'),
      responseCode: data.responseCode ?? '01',
      responseMessage: data.responseMessage ?? 'Status unknown',
      completedAt: data.completedAt
    };
  }

  private normalizeStatus(raw: string): 'PENDING' | 'SUCCESS' | 'FAILED' {
    const normalized = raw.toUpperCase();
    if (normalized === 'SUCCESS') return 'SUCCESS';
    if (normalized === 'FAILED') return 'FAILED';
    return 'PENDING';
  }

  private path(key: 'ptsaChargePath' | 'ptsaStatusPath') {
    return this.configService.get<string>(`integrations.licensed.${key}`, '');
  }

  private async request<T>(path: string, body: unknown): Promise<T> {
    const baseUrl = this.configService.get<string>('integrations.licensed.baseUrl');
    const apiKey = this.configService.get<string>('integrations.licensed.apiKey');
    const timeoutMs = this.configService.get<number>('integrations.licensed.timeoutMs', 10000);

    if (!baseUrl || !apiKey) {
      throw new ServiceUnavailableException(
        'Licensed infrastructure is not configured. Set LICENSED_INFRA_BASE_URL and LICENSED_INFRA_API_KEY.'
      );
    }
    if (!path) {
      throw new ServiceUnavailableException('Licensed PTSA endpoint path is not configured.');
    }

    const url = new URL(path, baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
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
          `Licensed PTSA request failed: ${response.status} ${response.statusText}`
        );
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Licensed PTSA provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Licensed PTSA request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}

