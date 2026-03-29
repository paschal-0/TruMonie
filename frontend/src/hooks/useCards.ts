import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useCards(token?: string) {
  return useQuery({
    queryKey: ['cards'],
    queryFn: () => apiGet<any[]>('/cards', token),
    enabled: !!token
  });
}
