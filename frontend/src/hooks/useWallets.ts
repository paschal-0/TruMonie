import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useWallets(token?: string) {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: () => apiGet<any[]>('/wallets', token),
    enabled: !!token
  });
}

export function useWalletAccountNumber(token?: string, currency: 'NGN' | 'USD' = 'NGN') {
  return useQuery({
    queryKey: ['wallets', 'account-number', currency],
    queryFn: () => apiGet<{ accountId: string; accountNumber: string; currency: string }>(
      `/wallets/account-number?currency=${currency}`,
      token
    ),
    enabled: !!token
  });
}
