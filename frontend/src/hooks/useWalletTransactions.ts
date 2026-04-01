import { useQuery } from '@tanstack/react-query';

import { apiGet } from '../api/client';

export interface WalletTransaction {
  id: string;
  reference: string;
  walletId: string;
  userId: string;
  type: 'CREDIT' | 'DEBIT';
  category: string;
  amountMinor: string;
  status: 'PENDING' | 'SUCCESS' | 'FAILED' | 'REVERSED';
  description: string;
  postedAt: string;
  channel?: string | null;
}

export interface WalletTransactionsResponse {
  page: number;
  perPage: number;
  total: number;
  items: WalletTransaction[];
}

export function useWalletTransactions(token?: string, accountId?: string, perPage = 10) {
  return useQuery({
    queryKey: ['wallets', 'transactions', accountId, perPage],
    queryFn: () =>
      apiGet<WalletTransactionsResponse>(
        `/wallets/${accountId}/transactions?page=1&per_page=${perPage}`,
        token
      ),
    enabled: !!token && !!accountId
  });
}
