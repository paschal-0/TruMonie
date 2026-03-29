import Constants from 'expo-constants';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://localhost:3000/api';

async function handleResponse<T>(res: Response): Promise<T> {
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const message = (data && data.message) || res.statusText;
    throw new Error(message);
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
