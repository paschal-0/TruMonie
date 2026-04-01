import {
  BadGatewayException,
  Injectable,
  ServiceUnavailableException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import {
  BillCategoryDefinition,
  BillExecutionResult,
  BillValidationResult,
  BillsProvider,
  NqrExecutionResult
} from '../interfaces/bills-provider.interface';

interface LicensedBillsPayload {
  id?: string;
  code?: string;
  name?: string;
  category?: string;
  amountType?: string;
  amountMinor?: string | number;
  requiresValidation?: boolean;
  validationFields?: string[];
  status?: string;
  providerReference?: string;
  billerReference?: string;
  reference?: string;
  token?: string;
  units?: string;
  customerName?: string;
  customerAddress?: string;
  customerRef?: string;
  outstandingBalanceMinor?: string | number;
  minimumAmountMinor?: string | number;
  validUntil?: string;
  sessionId?: string;
  merchantName?: string;
  metadata?: Record<string, unknown>;
  billers?: LicensedBillsPayload[];
  categories?: LicensedBillsPayload[];
  items?: LicensedBillsPayload[];
  data?: LicensedBillsPayload | LicensedBillsPayload[];
}

@Injectable()
export class LicensedBillsProvider implements BillsProvider {
  readonly name = 'licensed';

  constructor(private readonly configService: ConfigService) {}

  supportsCurrency(_currency: string): boolean {
    return true;
  }

  async listCategories(): Promise<BillCategoryDefinition[]> {
    const raw = await this.request<LicensedBillsPayload>('GET', this.catalogPath());
    const categories = this.extractCategories(raw);
    if (!categories.length) {
      throw new BadGatewayException('Licensed bills provider returned invalid categories');
    }
    return categories;
  }

  async validate(payload: {
    billerId: string;
    fields: Record<string, string>;
    reference: string;
  }): Promise<BillValidationResult> {
    const response = await this.request<LicensedBillsPayload>('POST', this.validatePath(), {
      biller_id: payload.billerId,
      fields: payload.fields,
      reference: payload.reference
    });
    const data = this.unwrap(response);
    const customerRef =
      data.customerRef ??
      payload.fields.meter_number ??
      payload.fields.account_number ??
      payload.fields.smartcard_number ??
      payload.fields.phone_number ??
      payload.fields.customer_id ??
      '';

    return {
      customerName: String(data.customerName ?? 'VALIDATED CUSTOMER'),
      customerAddress: data.customerAddress ? String(data.customerAddress) : null,
      customerRef: String(customerRef),
      outstandingBalanceMinor: this.toMinorString(data.outstandingBalanceMinor),
      minimumAmountMinor: this.toMinorString(data.minimumAmountMinor),
      validUntil: data.validUntil ? String(data.validUntil) : undefined,
      metadata: data.metadata ?? undefined
    };
  }

  async purchase(payload: {
    productCode: string;
    beneficiary: string;
    amountMinor: string;
    currency: string;
    reference: string;
    validationRef?: string;
    customerName?: string;
    customerRef?: string;
  }): Promise<BillExecutionResult> {
    const data = await this.request<LicensedBillsPayload>('POST', this.purchasePath(), {
      biller_id: payload.productCode,
      beneficiary: payload.beneficiary,
      amount: Number(payload.amountMinor),
      currency: payload.currency,
      reference: payload.reference,
      validation_ref: payload.validationRef,
      customer_name: payload.customerName,
      customer_ref: payload.customerRef
    });
    const raw = this.unwrap(data);
    const rawStatus = (raw.status ?? 'PENDING').toString().toUpperCase();
    const status: 'PENDING' | 'SUCCESS' | 'FAILED' =
      rawStatus === 'SUCCESS' ? 'SUCCESS' : rawStatus === 'FAILED' ? 'FAILED' : 'PENDING';

    return {
      status,
      providerReference:
        raw.providerReference ?? raw.reference ?? payload.reference,
      billerReference:
        raw.billerReference ?? raw.providerReference ?? raw.reference ?? payload.reference,
      token: raw.token ? String(raw.token) : undefined,
      units: raw.units ? String(raw.units) : undefined,
      metadata: raw.metadata ?? undefined
    };
  }

  async payNqr(payload: {
    qrData: string;
    amountMinor: string;
    currency: string;
    reference: string;
  }): Promise<NqrExecutionResult> {
    const data = await this.request<LicensedBillsPayload>('POST', this.nqrPayPath(), {
      qr_data: payload.qrData,
      amount: Number(payload.amountMinor),
      currency: payload.currency,
      reference: payload.reference
    });
    const raw = this.unwrap(data);
    const rawStatus = (raw.status ?? 'PENDING').toString().toUpperCase();
    const status: 'PENDING' | 'SUCCESS' | 'FAILED' =
      rawStatus === 'SUCCESS' ? 'SUCCESS' : rawStatus === 'FAILED' ? 'FAILED' : 'PENDING';
    return {
      status,
      providerReference:
        raw.providerReference ?? raw.reference ?? payload.reference,
      sessionId: raw.sessionId ? String(raw.sessionId) : undefined,
      merchantName: raw.merchantName ? String(raw.merchantName) : undefined,
      metadata: raw.metadata
    };
  }

  private catalogPath(): string {
    return this.configService.get<string>('integrations.licensed.billsCatalogPath', '');
  }

  private validatePath(): string {
    return this.configService.get<string>('integrations.licensed.billsValidatePath', '');
  }

  private purchasePath(): string {
    return this.configService.get<string>('integrations.licensed.billsPurchasePath', '');
  }

  private nqrPayPath(): string {
    return this.configService.get<string>('integrations.licensed.billsNqrPayPath', '');
  }

  private extractCategories(response: LicensedBillsPayload): BillCategoryDefinition[] {
    const raw = this.unwrap(response);
    const nestedCategories = Array.isArray(raw.categories)
      ? raw.categories
      : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.data)
      ? raw.data
      : Array.isArray(raw.billers)
      ? raw.billers
      : null;

    if (nestedCategories && nestedCategories.length > 0 && Array.isArray(nestedCategories[0]?.billers)) {
      return nestedCategories.map((entry) => ({
        id: String(entry.id ?? entry.code ?? 'other').toLowerCase(),
        name: String(entry.name ?? entry.id ?? entry.code ?? 'Other'),
        billers: (entry.billers ?? []).map((biller) => ({
          id: String(biller.id ?? biller.code ?? ''),
          name: String(biller.name ?? biller.id ?? biller.code ?? ''),
          category: String(entry.id ?? entry.code ?? 'other').toLowerCase(),
          requiresValidation: Boolean(biller.requiresValidation),
          validationFields: Array.isArray(biller.validationFields)
            ? biller.validationFields.map((field) => String(field))
            : [],
          amountType: biller.amountType === 'fixed' ? 'fixed' : 'variable',
          amountMinor:
            typeof biller.amountMinor === 'number'
              ? biller.amountMinor
              : biller.amountMinor
              ? Number.parseInt(String(biller.amountMinor), 10)
              : undefined,
          aggregator: this.name
        }))
      }));
    }

    const flatBillers = Array.isArray(response)
      ? response
      : Array.isArray(raw.items)
      ? raw.items
      : Array.isArray(raw.data)
      ? raw.data
      : null;
    if (!flatBillers) {
      return [];
    }

    const grouped = new Map<string, BillCategoryDefinition>();
    for (const entry of flatBillers) {
      const categoryId = String(entry.category ?? 'other').toLowerCase();
      if (!grouped.has(categoryId)) {
        grouped.set(categoryId, {
          id: categoryId,
          name: categoryId.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase()),
          billers: []
        });
      }
      grouped.get(categoryId)?.billers.push({
        id: String(entry.id ?? entry.code ?? ''),
        name: String(entry.name ?? entry.id ?? entry.code ?? ''),
        category: categoryId,
        requiresValidation: Boolean(entry.requiresValidation),
        validationFields: Array.isArray(entry.validationFields)
          ? entry.validationFields.map((field: unknown) => String(field))
          : [],
        amountType: entry.amountType === 'fixed' ? 'fixed' : 'variable',
        amountMinor:
          typeof entry.amountMinor === 'number'
            ? entry.amountMinor
            : entry.amountMinor
            ? Number.parseInt(String(entry.amountMinor), 10)
            : undefined,
        aggregator: this.name
      });
    }
    return [...grouped.values()];
  }

  private unwrap(payload: LicensedBillsPayload) {
    if (payload?.data && !Array.isArray(payload.data)) {
      return payload.data;
    }
    return payload;
  }

  private toMinorString(value?: string | number) {
    if (value === undefined || value === null) return '0';
    if (typeof value === 'number') return Math.trunc(value).toString();
    return String(value);
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
