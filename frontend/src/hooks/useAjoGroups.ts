import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useAjoGroups(token?: string) {
  return useQuery({
    queryKey: ['ajo', 'groups'],
    queryFn: () => apiGet<any[]>('/ajo/groups', token),
    enabled: !!token
  });
}
