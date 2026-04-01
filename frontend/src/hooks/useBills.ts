import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPost } from '../api/client';

export interface BillCategory {
  id: string;
  name: string;
  billers: Array<{
    id: string;
    name: string;
    requires_validation: boolean;
    validation_fields: string[];
    amount_type: 'fixed' | 'variable';
    amount_minor?: number | null;
  }>;
}

export interface BillValidationResponse {
  validation_ref: string;
  customer_name: string | null;
  customer_address: string | null;
  customer_ref: string | null;
  outstanding_balance: number;
  minimum_amount: number;
  valid_until: string;
}

export interface BillPayResponse {
  payment_id: string;
  reference: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  amount: number;
  fee: number;
  token?: string | null;
  units?: string | null;
  biller_reference?: string | null;
  receipt?: {
    customer_name?: string | null;
    customer_ref?: string | null;
    amount?: string | null;
    fee?: string | null;
    token?: string | null;
    units?: string | null;
    timestamp?: string;
  };
  timestamp?: string;
}

export interface NqrPayResponse {
  payment_id: string;
  merchant_name: string;
  amount: number;
  status: 'PENDING' | 'SUCCESS' | 'FAILED';
  session_id?: string | null;
}

export interface BillBeneficiary {
  id: string;
  productCode: string;
  destination: string;
  nickname: string;
  lastUsedAt?: string | null;
}

function invalidateBillViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['wallets'] });
  void queryClient.invalidateQueries({ queryKey: ['wallets', 'transactions'] });
  void queryClient.invalidateQueries({ queryKey: ['wallets', 'statement'] });
  void queryClient.invalidateQueries({ queryKey: ['bills', 'beneficiaries'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

export function useBillCategories() {
  return useQuery({
    queryKey: ['bills', 'categories'],
    queryFn: () => apiGet<{ categories: BillCategory[] }>('/bills/categories')
  });
}

export function useBillBeneficiaries(token?: string) {
  return useQuery({
    queryKey: ['bills', 'beneficiaries'],
    queryFn: async () => {
      const response = await apiGet<{ beneficiaries: BillBeneficiary[] }>('/bills/beneficiaries', token);
      return response.beneficiaries ?? [];
    },
    enabled: !!token
  });
}

export function useBillValidate(token?: string) {
  return useMutation({
    mutationFn: (body: { biller_id: string; fields: Record<string, string> }) =>
      apiPost<BillValidationResponse>('/bills/validate', body, token)
  });
}

export function useBillPay(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      wallet_id: string;
      biller_id: string;
      validation_ref?: string;
      customer_ref?: string;
      amount: number;
      currency: 'NGN' | 'USD';
      pin: string;
      idempotency_key: string;
    }) => apiPost<BillPayResponse>('/bills/pay', body, token),
    onSuccess: () => invalidateBillViews(queryClient)
  });
}

export function useBillNqrPay(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      wallet_id: string;
      qr_data: string;
      amount: number;
      currency: 'NGN' | 'USD';
      pin: string;
      idempotency_key: string;
    }) => apiPost<NqrPayResponse>('/bills/nqr/pay', body, token),
    onSuccess: () => invalidateBillViews(queryClient)
  });
}

export function useBillSaveBeneficiary(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { productCode: string; destination: string; nickname: string }) =>
      apiPost<BillBeneficiary>('/bills/beneficiaries', body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bills', 'beneficiaries'] });
    }
  });
}

export function useBillDeleteBeneficiary(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (beneficiaryId: string) => apiDelete(`/bills/beneficiaries/${beneficiaryId}`, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bills', 'beneficiaries'] });
    }
  });
}

