import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { apiGet, apiPatch } from '../api/client';

export function useNotifications(token?: string, limit = 50) {
  return useQuery({
    queryKey: ['notifications', limit],
    queryFn: () => apiGet<any[]>(`/notifications?limit=${limit}`, token),
    enabled: !!token
  });
}

export function useNotificationUnreadCount(token?: string) {
  return useQuery({
    queryKey: ['notifications', 'unread-count'],
    queryFn: () => apiGet<{ count: number }>('/notifications/unread-count', token),
    enabled: !!token
  });
}

export function useMarkNotificationRead(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiPatch(`/notifications/${id}/read`, {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    }
  });
}

export function useMarkAllNotificationsRead(token?: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiPatch('/notifications/read-all', {}, token),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications', 'unread-count'] });
    }
  });
}
