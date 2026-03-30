import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiPatch, apiPost } from '../api/client';

interface FxQuoteResponse {
  id: string;
  rate: number;
  spreadBps: number;
}

function invalidateWalletViews(queryClient: ReturnType<typeof useQueryClient>) {
  void queryClient.invalidateQueries({ queryKey: ['wallets'] });
  void queryClient.invalidateQueries({ queryKey: ['wallets', 'account-number'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications'] });
  void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
}

export const useP2PTransfer = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/payments/p2p', body, token),
    onSuccess: () => invalidateWalletViews(queryClient)
  });
};

export const useBankTransfer = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/payments/bank-transfer', body, token),
    onSuccess: () => invalidateWalletViews(queryClient)
  });
};

export const useBillPurchase = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/bills/purchase', body, token),
    onSuccess: () => {
      invalidateWalletViews(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['bills', 'beneficiaries'] });
    }
  });
};

export const useBillsSaveBeneficiary = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/bills/beneficiaries', body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['bills', 'beneficiaries'] });
    }
  });
};

export const useSavingsCreateVault = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/savings/vaults', body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['savings', 'vaults'] });
    }
  });
};

export const useSavingsDeposit = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/savings/vaults/deposit', body, token),
    onSuccess: () => {
      invalidateWalletViews(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['savings', 'vaults'] });
    }
  });
};

export const useSavingsWithdraw = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/savings/vaults/withdraw', body, token),
    onSuccess: () => {
      invalidateWalletViews(queryClient);
      void queryClient.invalidateQueries({ queryKey: ['savings', 'vaults'] });
    }
  });
};

export const useAjoCreate = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/ajo/groups', body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ajo', 'groups'] });
      invalidateWalletViews(queryClient);
    }
  });
};

export const useAjoJoin = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiPost(`/ajo/groups/${groupId}/join`, {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ajo', 'groups'] });
    }
  });
};

export const useAjoRunCycle = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (groupId: string) => apiPost(`/ajo/groups/${groupId}/run-cycle`, {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ajo', 'groups'] });
      invalidateWalletViews(queryClient);
    }
  });
};

export const useFxConvert = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/fx/convert', body, token),
    onSuccess: () => invalidateWalletViews(queryClient)
  });
};

export const useFxQuote = (token?: string) =>
  useMutation({
    mutationFn: (body: any) => apiPost<FxQuoteResponse>('/fx/quote', body, token)
  });

export const useRemitOutbound = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/remittance/outbound', body, token),
    onSuccess: () => invalidateWalletViews(queryClient)
  });
};

export const useRemitInbound = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/remittance/inbound', body, token),
    onSuccess: () => invalidateWalletViews(queryClient)
  });
};

export const useCardCreate = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: any) => apiPost('/cards', body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
    }
  });
};

export const useCardBlock = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => apiPatch(`/cards/${cardId}/block`, {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
    }
  });
};

export const useCardUnblock = (token?: string) => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (cardId: string) => apiPatch(`/cards/${cardId}/unblock`, {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cards'] });
    }
  });
};
