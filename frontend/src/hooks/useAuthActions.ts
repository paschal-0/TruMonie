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

export function useSetLoginPassword(token?: string) {
  return useMutation({
    mutationFn: (body: any) => apiPost('/auth/password/set', body, token)
  });
}

export function useCreateBiometricChallenge(token?: string) {
  return useMutation({
    mutationFn: (body: { type?: 'FINGERPRINT' | 'FACE_ID' }) =>
      apiPost<{ challenge_id: string; type: string; expires_at: string }>(
        '/auth/biometric/challenge',
        body,
        token
      )
  });
}

export function useVerifyBiometricChallenge(token?: string) {
  return useMutation({
    mutationFn: (body: { challenge_id: string; signed_attestation: string }) =>
      apiPost<{ verified: boolean; ticket_id: string; expires_at: string }>(
        '/auth/biometric/verify',
        body,
        token
      )
  });
}
