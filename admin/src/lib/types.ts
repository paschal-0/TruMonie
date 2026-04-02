export interface AdminUser {
  id: string;
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  role: 'USER' | 'ADMIN';
}

export interface ApiErrorShape {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
}

