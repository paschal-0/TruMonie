import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export interface WalletStatementResponse {
  count: number;
  lines: any[];
}

export function useWalletStatement(token?: string, accountId?: string, limit = 10) {
  return useQuery({
    queryKey: ['wallets', 'statement', accountId, limit],
    queryFn: () =>
      apiGet<WalletStatementResponse>(`/wallets/${accountId}/statement?limit=${limit}&offset=0`, token),
    enabled: !!token && !!accountId
  });
}
