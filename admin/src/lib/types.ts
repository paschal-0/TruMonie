export interface AdminUser {
  id: string;
  email: string;
  phoneNumber: string;
  firstName: string;
  lastName: string;
  role:
    | 'USER'
    | 'ADMIN'
    | 'SUPER_ADMIN'
    | 'COMPLIANCE_OFFICER'
    | 'OPERATIONS_MANAGER'
    | 'FINANCE_OFFICER'
    | 'CUSTOMER_SUPPORT'
    | 'AUDITOR';
}

export interface ApiErrorShape {
  status?: number;
  code?: string;
  message: string;
  details?: unknown;
}
