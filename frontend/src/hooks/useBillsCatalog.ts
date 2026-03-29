import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useBillsCatalog() {
  return useQuery({
    queryKey: ['bills', 'catalog'],
    queryFn: () => apiGet<any[]>('/bills/catalog')
  });
}
