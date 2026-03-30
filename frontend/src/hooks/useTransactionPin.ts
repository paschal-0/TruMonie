import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPost } from '../api/client';

export function useTransactionPinStatus(token?: string) {
  return useQuery({
    queryKey: ['users', 'pin-status'],
    queryFn: () => apiGet<{ hasTransactionPin: boolean }>('/users/me/pin-status', token),
    enabled: !!token
  });
}

export function useSetTransactionPin(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { pin: string; currentPin?: string }) => apiPost('/users/me/pin', body, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['users', 'pin-status'] });
    }
  });
}
