import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';

export function useBillsBeneficiaries(token?: string) {
  return useQuery({
    queryKey: ['bills', 'beneficiaries'],
    queryFn: async () => {
      const response = await apiGet<{ beneficiaries?: any[] } | any[]>('/bills/beneficiaries', token);
      return Array.isArray(response) ? response : response?.beneficiaries ?? [];
    },
    enabled: !!token
  });
}
