import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useSavingsVaults(token?: string) {
  return useQuery({
    queryKey: ['savings', 'vaults'],
    queryFn: () => apiGet<any[]>('/savings/vaults', token),
    enabled: !!token
  });
}
