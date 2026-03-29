import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useWallets(token?: string) {
  return useQuery({
    queryKey: ['wallets'],
    queryFn: () => apiGet<any[]>('/wallets', token),
    enabled: !!token
  });
}
