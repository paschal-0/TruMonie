import { ForbiddenException, Injectable } from '@nestjs/common';

import { AccountsService } from './accounts.service';

@Injectable()
export class AccountsPolicy {
  constructor(private readonly accountsService: AccountsService) {}

  async assertOwnership(userId: string, accountId: string) {
    const account = await this.accountsService.findById(accountId);
    if (!account || account.userId !== userId) {
      throw new ForbiddenException('You do not have access to this account');
    }
    return account;
  }
}
