import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { KycProvider } from '../interfaces/kyc-provider.interface';

interface KycPayload {
  match?: boolean;
  verified?: boolean;
  reference?: string;
  data?: KycPayload;
  [key: string]: unknown;
}

@Injectable()
export class LicensedKycProvider implements KycProvider {
  readonly name = 'licensed';

  constructor(private readonly configService: ConfigService) {}

  async verifyBvnAndNin(params: {
    bvn: string;
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }> {
    const data = await this.request<KycPayload>('POST', this.verifyPath(), params);
    const payload = data?.data ?? data;
    return {
      match: Boolean(payload?.match ?? payload?.verified),
      reference: String(payload?.reference ?? `licensed-kyc-${Date.now()}`),
      metadata:
        payload && typeof payload === 'object'
          ? (payload as Record<string, unknown>)
          : { raw: payload }
    };
  }

  private verifyPath(): string {
    return this.configService.get<string>('integrations.licensed.kycVerifyPath', '');
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
      throw new ServiceUnavailableException('Licensed KYC endpoint path is not configured.');
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
          `Licensed KYC provider request failed: ${response.status} ${response.statusText}`
        );
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Licensed KYC provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Licensed KYC provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
