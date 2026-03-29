export interface BillsProvider {
  name: string;
  supportsCurrency?(currency: string): boolean;
  listCatalog(): Promise<
    Array<{
      code: string;
      name: string;
      category: string;
      amountType: 'fixed' | 'variable';
      amountMinor?: number;
    }>
  >;
  purchase(payload: {
    productCode: string;
    beneficiary: string;
    amountMinor: string;
    currency: string;
    reference: string;
  }): Promise<{
    status: 'PENDING' | 'SUCCESS' | 'FAILED';
    providerReference: string;
    metadata?: Record<string, unknown>;
  }>;
}
