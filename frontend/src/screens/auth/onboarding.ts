export interface OnboardingDraft {
  email: string;
  phoneDisplay: string;
  phoneE164: string;
  dateOfBirth: string;
  tokens: {
    accessToken: string;
    refreshToken: string;
  };
}

export function normalizePhoneToE164(input: string): string | null {
  const digits = input.replace(/\D/g, '');
  if (/^0\d{10}$/.test(digits)) return `+234${digits.slice(1)}`;
  if (/^234\d{10}$/.test(digits)) return `+${digits}`;
  if (/^\d{10}$/.test(digits)) return `+234${digits}`;
  if (/^\+234\d{10}$/.test(input)) return input;
  return null;
}

export function formatLocalPhone(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 11);
  if (digits.length <= 4) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 4)} ${digits.slice(4)}`;
  return `${digits.slice(0, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
}

export function buildUsername(firstName: string, lastName: string): string {
  const root = `${firstName}.${lastName}`
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, '')
    .replace(/\.+/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '');
  const suffix = `${Math.floor(Math.random() * 9000) + 1000}`;
  return `${root || 'user'}${suffix}`;
}

export function generateTempPassword(): string {
  return `TruMonie#${Math.floor(Math.random() * 900000 + 100000)}`;
}
