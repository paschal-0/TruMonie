import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { KycProvider } from '../interfaces/kyc-provider.interface';

interface InterswitchEnvelope<T> {
  success?: boolean;
  code?: string;
  message?: string;
  data?: T;
  responseCode?: string;
  errors?: unknown[];
  logId?: string;
}

interface BvnNinData {
  id?: string;
  status?: string;
  firstName?: string;
  middleName?: string;
  lastName?: string;
  dateOfBirth?: string;
  mobile?: string;
  image?: string;
  idNumber?: string;
  allValidationPassed?: boolean;
  [key: string]: unknown;
}

interface FaceCompareData {
  id?: string;
  status?: string;
  imageComparison?: {
    confidenceLevel?: number;
    threshold?: number;
    match?: boolean;
    image1?: string;
    image2?: string;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

interface OAuthTokenResponse {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
}

@Injectable()
export class InterswitchKycProvider implements KycProvider {
  readonly name = 'interswitch';
  private tokenCache: { token: string; expiresAt: number } | null = null;

  constructor(private readonly configService: ConfigService) {}

  async verifyBvn(params: {
    bvn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phone?: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }> {
    const envelope = await this.callProtected<InterswitchEnvelope<BvnNinData>>(
      this.bvnVerifyPath(),
      { id: params.bvn }
    );
    const data = envelope.data ?? {};
    const match = this.matchFoundRecord(data);
    return {
      match,
      reference: String(data.id ?? `isw-bvn-${Date.now()}`),
      metadata: {
        ...data,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        phoneNumber: data.mobile,
        source: 'interswitch-bvn'
      }
    };
  }

  async verifyNin(params: {
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }> {
    const envelope = await this.callProtected<InterswitchEnvelope<BvnNinData>>(
      this.ninVerifyPath(),
      { id: params.nin }
    );
    const data = envelope.data ?? {};
    const match = this.matchFoundRecord(data);
    return {
      match,
      reference: String(data.id ?? `isw-nin-${Date.now()}`),
      metadata: {
        ...data,
        firstName: data.firstName,
        lastName: data.lastName,
        dateOfBirth: data.dateOfBirth,
        phoneNumber: data.mobile,
        source: 'interswitch-nin'
      }
    };
  }

  async verifyBvnAndNin(params: {
    bvn: string;
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }> {
    const [bvn, nin] = await Promise.all([
      this.verifyBvn({
        bvn: params.bvn,
        firstName: params.firstName,
        lastName: params.lastName,
        dateOfBirth: params.dateOfBirth
      }),
      this.verifyNin({
        nin: params.nin,
        firstName: params.firstName,
        lastName: params.lastName,
        dateOfBirth: params.dateOfBirth
      })
    ]);
    return {
      match: bvn.match && nin.match,
      reference: `${bvn.reference}:${nin.reference}`,
      metadata: { bvn: bvn.metadata, nin: nin.metadata }
    };
  }

  async compareFace(params: { image1: string; image2: string }): Promise<{
    match: boolean;
    confidence: number;
    threshold: number;
    reference: string;
    metadata: Record<string, unknown>;
  }> {
    const envelope = await this.callProtected<InterswitchEnvelope<FaceCompareData>>(
      this.faceComparePath(),
      {
        image1: params.image1,
        image2: params.image2
      }
    );
    const data = envelope.data ?? {};
    const comparison = data.imageComparison ?? {};
    const confidence = Number(comparison.confidenceLevel ?? 0);
    const threshold = Number(comparison.threshold ?? 70);
    const match = Boolean(comparison.match) && confidence >= threshold;

    return {
      match,
      confidence,
      threshold,
      reference: String(data.id ?? `isw-face-${Date.now()}`),
      metadata: {
        ...data,
        imageComparison: comparison,
        source: 'interswitch-face'
      }
    };
  }

  private async callProtected<T>(path: string, body: Record<string, unknown>): Promise<T> {
    const token = await this.getAccessToken();
    const baseUrl = this.routingBaseUrl();
    const timeoutMs = this.timeoutMs();
    const url = new URL(path, baseUrl).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${token}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });
      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as InterswitchEnvelope<unknown>) : {};
      if (!response.ok) {
        throw new BadGatewayException(
          `Interswitch KYC request failed: ${response.status} ${response.statusText}`
        );
      }
      if (parsed?.responseCode === 'ERROR') {
        throw new BadGatewayException(String(parsed.message ?? 'Interswitch returned an error'));
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Interswitch returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Interswitch KYC request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private async getAccessToken(): Promise<string> {
    if (this.tokenCache && Date.now() < this.tokenCache.expiresAt) {
      return this.tokenCache.token;
    }

    const clientId = this.configService.get<string>('integrations.interswitch.clientId');
    const clientSecret = this.configService.get<string>('integrations.interswitch.clientSecret');
    if (!clientId || !clientSecret) {
      throw new ServiceUnavailableException(
        'Interswitch is not configured. Set INTERSWITCH_CLIENT_ID and INTERSWITCH_CLIENT_SECRET.'
      );
    }

    const tokenUrl = new URL(this.oauthTokenPath(), this.oauthBaseUrl()).toString();
    const timeoutMs = this.timeoutMs();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
      const form = new URLSearchParams();
      form.set('scope', this.oauthScope());
      form.set('grant_type', this.oauthGrantType());

      const response = await fetch(tokenUrl, {
        method: 'POST',
        headers: {
          'content-type': 'application/x-www-form-urlencoded',
          authorization: `Basic ${auth}`
        },
        body: form.toString(),
        signal: controller.signal
      });

      const text = await response.text();
      const parsed = text ? (JSON.parse(text) as OAuthTokenResponse) : {};
      if (!response.ok || !parsed.access_token) {
        throw new BadGatewayException(
          `Interswitch OAuth token request failed: ${response.status} ${response.statusText}`
        );
      }

      const expiresInSec = Number(parsed.expires_in ?? 3600);
      this.tokenCache = {
        token: parsed.access_token,
        expiresAt: Date.now() + Math.max(expiresInSec - 30, 60) * 1000
      };
      return parsed.access_token;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Interswitch OAuth returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Interswitch OAuth token request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private matchFoundRecord(data: BvnNinData): boolean {
    const status = String(data.status ?? '').toLowerCase();
    return status === 'found' || Boolean(data.allValidationPassed);
  }

  private oauthBaseUrl(): string {
    return this.configService.get<string>('integrations.interswitch.oauthBaseUrl', '');
  }

  private oauthTokenPath(): string {
    return this.configService.get<string>('integrations.interswitch.oauthTokenPath', '');
  }

  private oauthScope(): string {
    return this.configService.get<string>('integrations.interswitch.scope', 'profile');
  }

  private oauthGrantType(): string {
    return this.configService.get<string>('integrations.interswitch.grantType', 'client_credentials');
  }

  private routingBaseUrl(): string {
    return this.configService.get<string>('integrations.interswitch.routingBaseUrl', '');
  }

  private bvnVerifyPath(): string {
    return this.configService.get<string>('integrations.interswitch.bvnVerifyPath', '');
  }

  private ninVerifyPath(): string {
    return this.configService.get<string>('integrations.interswitch.ninVerifyPath', '');
  }

  private faceComparePath(): string {
    return this.configService.get<string>('integrations.interswitch.faceComparePath', '');
  }

  private timeoutMs(): number {
    return this.configService.get<number>('integrations.interswitch.timeoutMs', 10000);
  }
}
