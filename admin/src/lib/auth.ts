export const ADMIN_TOKEN_KEY = 'trumonie_admin_access_token';
export const ADMIN_USER_KEY = 'trumonie_admin_user';

export function getStoredToken() {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setStoredToken(token: string) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearStoredToken() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function getStoredUser<T>() {
  if (typeof window === 'undefined') return null;
  const raw = localStorage.getItem(ADMIN_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function setStoredUser(user: unknown) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(ADMIN_USER_KEY, JSON.stringify(user));
}

export function clearStoredUser() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(ADMIN_USER_KEY);
}

export function clearSession() {
  clearStoredToken();
  clearStoredUser();
}

export function isAdminRole(role?: string | null) {
  if (!role) return false;
  return role !== 'USER';
}
