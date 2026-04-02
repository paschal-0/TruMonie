import { ApiErrorShape } from './types';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000/api';

function parseJson(input: string) {
  if (!input) return {};
  try {
    return JSON.parse(input);
  } catch {
    return {};
  }
}

async function request<T>(method: string, path: string, token?: string, body?: unknown): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: 'no-store'
  });

  const raw = await response.text();
  const data = parseJson(raw) as Record<string, any>;
  if (!response.ok) {
    const envelopeError = data.error ?? {};
    const err: ApiErrorShape = {
      status: envelopeError.statusCode ?? response.status,
      code: envelopeError.code,
      message:
        envelopeError.message ?? data.message ?? response.statusText ?? 'Request failed',
      details: envelopeError.details ?? data.details
    };
    throw err;
  }
  return data as T;
}

export function apiGet<T>(path: string, token?: string) {
  return request<T>('GET', path, token);
}

export function apiPost<T>(path: string, body: unknown, token?: string) {
  return request<T>('POST', path, token, body);
}

export function apiPatch<T>(path: string, body: unknown, token?: string) {
  return request<T>('PATCH', path, token, body);
}

export { API_URL };

