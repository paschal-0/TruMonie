export interface BillerDefinition {
  id: string;
  name: string;
  category: string;
  requiresValidation: boolean;
  validationFields: string[];
  amountType: 'fixed' | 'variable';
  amountMinor?: number;
  aggregator?: string;
}

export interface BillCategoryDefinition {
  id: string;
  name: string;
  billers: BillerDefinition[];
}

export interface BillValidationResult {
  customerName: string;
  customerAddress?: string | null;
  customerRef: string;
  outstandingBalanceMinor?: string;
  minimumAmountMinor?: string;
  validUntil?: string;
  metadata?: Record<string, unknown>;
}

export interface BillExecutionResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  providerReference: string;
  billerReference?: string;
  token?: string;
  units?: string;
  metadata?: Record<string, unknown>;
}

export interface NqrExecutionResult {
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  providerReference: string;
  sessionId?: string;
  merchantName?: string;
  metadata?: Record<string, unknown>;
}

export interface BillsProvider {
  name: string;
  supportsCurrency?(currency: string): boolean;
  listCategories(): Promise<BillCategoryDefinition[]>;
  validate?(payload: {
    billerId: string;
    fields: Record<string, string>;
    reference: string;
  }): Promise<BillValidationResult>;
  purchase(payload: {
    productCode: string;
    beneficiary: string;
    amountMinor: string;
    currency: string;
    reference: string;
    validationRef?: string;
    customerName?: string;
    customerRef?: string;
  }): Promise<BillExecutionResult>;
  payNqr?(payload: {
    qrData: string;
    amountMinor: string;
    currency: string;
    reference: string;
  }): Promise<NqrExecutionResult>;
}
