import { Injectable, OnModuleInit } from '@nestjs/common';

import { PlatformAdminRbacService } from './platform-admin-rbac.service';

@Injectable()
export class PlatformAdminBootstrapService implements OnModuleInit {
  constructor(private readonly rbacService: PlatformAdminRbacService) {}

  async onModuleInit() {
    await this.rbacService.seedDefaultPermissions();
  }
}

