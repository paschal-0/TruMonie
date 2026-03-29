import { useMutation } from '@tanstack/react-query';
import { apiPatch, apiPost } from '../api/client';

interface FxQuoteResponse {
  id: string;
  rate: number;
  spreadBps: number;
}

export const useP2PTransfer = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/payments/p2p', body, token)
  });

export const useBankTransfer = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/payments/bank-transfer', body, token)
  });

export const useBillPurchase = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/bills/purchase', body, token)
  });

export const useSavingsDeposit = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/savings/vaults/deposit', body, token)
  });

export const useSavingsWithdraw = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/savings/vaults/withdraw', body, token)
  });

export const useAjoCreate = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/ajo/groups', body, token)
  });

export const useAjoJoin = (token?: string) =>
  useMutation({
    mutationFn: (groupId: string) => apiPost(`/ajo/groups/${groupId}/join`, {}, token)
  });

export const useAjoRunCycle = (token?: string) =>
  useMutation({
    mutationFn: (groupId: string) => apiPost(`/ajo/groups/${groupId}/run-cycle`, {}, token)
  });

export const useFxConvert = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/fx/convert', body, token)
  });

export const useFxQuote = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost<FxQuoteResponse>('/fx/quote', body, token)
  });

export const useRemitOutbound = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/remittance/outbound', body, token)
  });

export const useRemitInbound = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/remittance/inbound', body, token)
  });

export const useCardCreate = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost('/cards', body, token)
  });

export const useCardBlock = (token?: string) =>
  useMutation({
    mutationFn: (cardId: string) => apiPatch(`/cards/${cardId}/block`, {}, token)
  });

export const useCardUnblock = (token?: string) =>
  useMutation({
    mutationFn: (cardId: string) => apiPatch(`/cards/${cardId}/unblock`, {}, token)
  });
