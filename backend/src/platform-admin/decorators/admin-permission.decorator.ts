import { SetMetadata } from '@nestjs/common';

export const ADMIN_PERMISSION_KEY = 'admin_permission';

export interface AdminPermissionMeta {
  resource: string;
  action: string;
}

export const AdminPermission = (resource: string, action: string) =>
  SetMetadata(ADMIN_PERMISSION_KEY, { resource, action } as AdminPermissionMeta);

