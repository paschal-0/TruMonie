import { useMutation } from '@tanstack/react-query';
import { apiPost } from '../api/client';

export function useLogin(onSuccess: (data: any) => void) {
  return useMutation({
    mutationFn: (body: any) => apiPost('/auth/login', body),
    onSuccess
  });
}

export function useRegister(onSuccess: (data: any) => void) {
  return useMutation({
    mutationFn: (body: any) => apiPost('/auth/register', body),
    onSuccess
  });
}

export function useSendOtp() {
  return useMutation({
    mutationFn: (body: any) => apiPost('/auth/otp/send', body)
  });
}

export function useVerifyOtp() {
  return useMutation({
    mutationFn: (body: any) => apiPost('/auth/otp/verify', body)
  });
}
