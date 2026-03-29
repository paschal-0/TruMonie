import { useQuery } from '@tanstack/react-query';
import { apiGet } from '../api/client';
import { Currency } from '../types';

export function useFxRate(base: Currency, quote: Currency) {
  return useQuery({
    queryKey: ['fx', 'rate', base, quote],
    queryFn: () => apiGet<{ rate: number }>(`/fx/rate?base=${base}&quote=${quote}`),
    enabled: !!base && !!quote
  });
}
