import {
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'crypto';

import { Currency } from '../../ledger/enums/currency.enum';
import { PaymentProvider } from '../interfaces/payment-provider.interface';

interface LicensedPayload {
  accountNumber?: string;
  bankName?: string;
  providerReference?: string;
  reference?: string;
  status?: string;
  bankCode?: string;
  accountName?: string;
  accountNumberResolved?: string;
  sessionId?: string;
  responseCode?: string;
  responseMessage?: string;
  completedAt?: string;
  data?: LicensedPayload;
  idempotencyKey?: string;
  userId?: string;
  amountMinor?: string | number;
  amount?: string | number;
  currency?: Currency;
}

@Injectable()
export class LicensedPaymentProvider implements PaymentProvider {
  readonly name = 'licensed';
  private readonly logger = new Logger(LicensedPaymentProvider.name);

  constructor(private readonly configService: ConfigService) {}

  supportsCurrency(_currency: Currency): boolean {
    return true;
  }

  async createVirtualAccount(request: { userId: string; currency: string; accountName?: string }) {
    const data = await this.request<LicensedPayload>('POST', this.path('paymentsVirtualAccountPath'), {
      userId: request.userId,
      currency: request.currency,
      accountName: request.accountName
    });
    return {
      accountNumber: data?.accountNumber ?? data?.data?.accountNumber ?? '',
      bankName: data?.bankName ?? data?.data?.bankName ?? 'Licensed Bank',
      bankCode: data?.bankCode ?? data?.data?.bankCode ?? '000',
      accountName: data?.accountName ?? data?.data?.accountName ?? request.accountName
    };
  }

  async initiatePayout(
    userId: string,
    amountMinor: string,
    currency: Currency,
    destination: { bankCode: string; accountNumber: string; accountName?: string },
    narration?: string
  ) {
    const data = await this.request<LicensedPayload>('POST', this.path('paymentsPayoutPath'), {
      userId,
      amountMinor,
      currency,
      destination,
      narration
    });
    const rawStatus = (data?.status ?? data?.data?.status ?? 'PENDING').toString().toUpperCase();
    const status: 'PENDING' | 'SUCCESS' | 'FAILED' =
      rawStatus === 'SUCCESS' ? 'SUCCESS' : rawStatus === 'FAILED' ? 'FAILED' : 'PENDING';
    return {
      providerReference:
        data?.providerReference ?? data?.reference ?? data?.data?.providerReference ?? `LIC-${Date.now()}`,
      status,
      responseCode: data?.responseCode ?? data?.data?.responseCode,
      responseMessage: data?.responseMessage ?? data?.data?.responseMessage,
      sessionId: data?.sessionId ?? data?.data?.sessionId
    };
  }

  async queryTransferStatus(params: { providerReference?: string; reference: string; sessionId?: string }) {
    const data = await this.request<LicensedPayload>('POST', this.path('paymentsStatusPath'), {
      providerReference: params.providerReference,
      reference: params.reference,
      sessionId: params.sessionId
    });
    const rawStatus = (data?.status ?? data?.data?.status ?? 'PENDING').toString().toUpperCase();
    const status: 'PENDING' | 'SUCCESS' | 'FAILED' =
      rawStatus === 'SUCCESS' ? 'SUCCESS' : rawStatus === 'FAILED' ? 'FAILED' : 'PENDING';
    return {
      status,
      responseCode: (data?.responseCode ?? data?.data?.responseCode ?? '01').toString(),
      responseMessage:
        (data?.responseMessage ?? data?.data?.responseMessage ?? 'Status unknown').toString(),
      completedAt: data?.completedAt ?? data?.data?.completedAt
    };
  }

  verifyWebhookSignature(payload: string, signature: string): boolean {
    const secret = this.configService.get<string>('integrations.licensed.webhookSecret');
    if (!secret || !signature) {
      this.logger.warn('Missing LICENSED_INFRA_WEBHOOK_SECRET or signature');
      return false;
    }
    const digest = createHmac('sha256', secret).update(payload).digest('hex');
    try {
      return timingSafeEqual(Buffer.from(digest, 'utf8'), Buffer.from(signature, 'utf8'));
    } catch {
      return false;
    }
  }

  parseFundingWebhook(body: unknown) {
    const payload = body as LicensedPayload;
    const data = payload.data ?? payload;
    return {
      idempotencyKey: data?.idempotencyKey ?? data?.reference ?? `licensed-${Date.now()}`,
      userId: data?.userId ?? '',
      amountMinor: data?.amountMinor?.toString() ?? data?.amount?.toString() ?? '0',
      currency: data?.currency ?? Currency.NGN,
      reference: data?.reference ?? `LICENSED-FUND-${Date.now()}`
    };
  }

  async resolveBankAccount(bankCode: string, accountNumber: string) {
    const data = await this.request<LicensedPayload>('POST', this.path('paymentsResolvePath'), {
      bankCode,
      accountNumber
    });
    return {
      bankCode: data?.bankCode ?? bankCode,
      accountNumber: data?.accountNumber ?? data?.accountNumberResolved ?? accountNumber,
      accountName: data?.accountName ?? data?.data?.accountName ?? 'Unresolved'
    };
  }

  private path(
    key:
      | 'paymentsVirtualAccountPath'
      | 'paymentsPayoutPath'
      | 'paymentsResolvePath'
      | 'paymentsStatusPath'
  ): string {
    return this.configService.get<string>(`integrations.licensed.${key}`, '');
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
      throw new ServiceUnavailableException('Licensed infrastructure endpoint path is not configured.');
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
          `Licensed provider request failed: ${response.status} ${response.statusText}`
        );
      }
      return parsed as T;
    } catch (error: unknown) {
      if (error instanceof SyntaxError) {
        throw new BadGatewayException('Licensed provider returned invalid JSON');
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new BadGatewayException('Licensed provider request timed out');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }
}
