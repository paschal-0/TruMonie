import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useProfile(token?: string) {
  return useQuery({
    queryKey: ['auth', 'me'],
    queryFn: () => apiGet<any>('/auth/me', token),
    enabled: !!token
  });
}
