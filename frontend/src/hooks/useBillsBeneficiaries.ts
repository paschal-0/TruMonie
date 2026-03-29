import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useBillsBeneficiaries(token?: string) {
  return useQuery({
    queryKey: ['bills', 'beneficiaries'],
    queryFn: () => apiGet<any[]>('/bills/beneficiaries', token),
    enabled: !!token
  });
}
