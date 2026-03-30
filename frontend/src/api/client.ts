import Constants from 'expo-constants';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://localhost:3000/api';

class ApiError extends Error {
  status: number;
  details: unknown;
  code?: string;

  constructor(message: string, status: number, details: unknown = null, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
    this.code = code;
  }
}

function parseJson(text: string) {
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
}

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = parseJson(text);
  if (!res.ok) {
    const payload = (data as any) ?? {};
    const envelopeError = payload.error ?? {};
    const message = envelopeError.message ?? payload.message ?? res.statusText ?? 'Request failed';
    throw new ApiError(message, res.status, envelopeError.details ?? payload.details ?? null, envelopeError.code);
  }
  return data as T;
}

export async function apiGet<T>(path: string, token?: string) {
  return apiRequest<T>('GET', path, undefined, token);
}

export async function apiPost<T>(path: string, body: any, token?: string) {
  return apiRequest<T>('POST', path, body, token);
}

export async function apiPatch<T>(path: string, body: any, token?: string) {
  return apiRequest<T>('PATCH', path, body, token);
}

async function apiRequest<T>(method: 'GET' | 'POST' | 'PATCH', path: string, body?: any, token?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers: {
      ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return handleResponse<T>(res);
}
