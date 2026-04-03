import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiDelete, apiGet, apiPost } from '../api/client';

function invalidateWalletData(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['wallets'] });
  void queryClient.invalidateQueries({ queryKey: ['wallets', 'transactions'] });
  void queryClient.invalidateQueries({ queryKey: ['wallets', 'statement'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
}

export interface NameEnquiryResponse {
  account_name: string;
  account_number: string;
  bank_code: string;
  bank_name: string;
  session_id: string;
  kyc_level: number;
}

export interface TransferInitiationResponse {
  transfer_id: string;
  reference: string;
  session_id: string | null;
  amount: number;
  fee: number;
  status: 'PROCESSING' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'MANUAL_REVIEW';
  estimated_completion: string;
  warning_code?: string;
}

export interface TransferStatusResponse {
  transfer_id: string;
  reference: string;
  status: 'PROCESSING' | 'PENDING' | 'SUCCESS' | 'FAILED' | 'MANUAL_REVIEW';
  nip_response_code?: string | null;
  nip_response_message?: string | null;
  completed_at?: string | null;
}

export interface InternalTransferResponse {
  transfer_id: string;
  reference: string;
  status: 'SUCCESS' | 'FAILED' | 'PROCESSING' | 'PENDING' | 'MANUAL_REVIEW';
  amount: number;
  fee: number;
  completed_at: string | null;
}

export interface TransferReceiptResponse {
  receipt_id: string;
  reference: string;
  type: string;
  from: { name: string; account: string };
  to: { name: string; account: string; bank: string };
  amount: string;
  fee: string;
  total: string;
  status: string;
  timestamp: string;
  session_id?: string | null;
  qr_code_url?: string;
}

export interface BeneficiaryRow {
  id: string;
  alias: string | null;
  account_name: string;
  account_number: string;
  bank_code: string;
  bank_name: string | null;
  last_used_at: string | null;
}

export function useTransferNameEnquiry(token?: string) {
  return useMutation({
    mutationFn: (body: { destination_bank_code: string; account_number: string; provider?: string }) =>
      apiPost<NameEnquiryResponse>('/transfers/name-enquiry', body, token)
  });
}

export function useCreateBankTransfer(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      source_wallet_id: string;
      destination_bank_code: string;
      destination_account: string;
      destination_name: string;
      amount: number;
      narration?: string;
      pin: string;
      otp_code?: string;
      otp_destination?: string;
      biometric_ticket?: string;
      idempotency_key: string;
      session_id?: string;
      provider?: string;
    }) => apiPost<TransferInitiationResponse>('/transfers', body, token),
    onSuccess: () => invalidateWalletData(queryClient)
  });
}

export function useCreateInternalTransfer(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      source_wallet_id: string;
      destination_wallet_id: string;
      amount: number;
      narration?: string;
      pin: string;
      otp_code?: string;
      otp_destination?: string;
      biometric_ticket?: string;
      idempotency_key: string;
    }) => apiPost<InternalTransferResponse>('/transfers/internal', body, token),
    onSuccess: () => invalidateWalletData(queryClient)
  });
}

export function useTransferStatus(token?: string, transferId?: string, enabled = true) {
  return useQuery({
    queryKey: ['transfers', 'status', transferId],
    queryFn: () => apiGet<TransferStatusResponse>(`/transfers/${transferId}/status`, token),
    enabled: !!token && !!transferId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;
      return status === 'PENDING' || status === 'PROCESSING' ? 7000 : false;
    }
  });
}

export function useTransferReceipt(token?: string, transferId?: string, enabled = true) {
  return useQuery({
    queryKey: ['transfers', 'receipt', transferId],
    queryFn: () => apiGet<TransferReceiptResponse>(`/transfers/${transferId}/receipt`, token),
    enabled: !!token && !!transferId && enabled
  });
}

export function useTransferBeneficiaries(token?: string) {
  return useQuery({
    queryKey: ['transfers', 'beneficiaries'],
    queryFn: () => apiGet<{ beneficiaries: BeneficiaryRow[] }>('/beneficiaries', token),
    enabled: !!token
  });
}

export function useSaveTransferBeneficiary(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      account_number: string;
      bank_code: string;
      account_name: string;
      alias?: string;
      bank_name?: string;
    }) => apiPost('/beneficiaries', body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transfers', 'beneficiaries'] });
    }
  });
}

export function useDeleteTransferBeneficiary(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiDelete(`/beneficiaries/${id}`, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['transfers', 'beneficiaries'] });
    }
  });
}
