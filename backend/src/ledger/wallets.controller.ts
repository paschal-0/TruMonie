import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AccountsService } from './accounts.service';
import { AccountsPolicy } from './accounts.policy';

@UseGuards(JwtAuthGuard)
@Controller('wallets')
export class WalletsController {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly accountsPolicy: AccountsPolicy
  ) {}

  @Get()
  list(@CurrentUser() user: User) {
    return this.accountsService.getUserAccounts(user.id);
  }

  @Get(':accountId/statement')
  async statement(
    @CurrentUser() user: User,
    @Param('accountId') accountId: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string
  ) {
    const take = Math.min(parseInt(limit ?? '50', 10), 200);
    const skip = parseInt(offset ?? '0', 10);
    await this.accountsPolicy.assertOwnership(user.id, accountId);
    return this.accountsService.getStatement(accountId, take, skip);
  }
}
