import { BadRequestException, Controller, Get, Param, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AccountsService } from './accounts.service';
import { AccountsPolicy } from './accounts.policy';
import { Currency } from './enums/currency.enum';

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

  @Get('account-number')
  accountNumber(@CurrentUser() user: User, @Query('currency') currencyRaw?: string) {
    const currency = this.normalizeCurrency(currencyRaw);
    return this.accountsService.getCanonicalAccountNumber(user.id, currency);
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

  private normalizeCurrency(value?: string): Currency {
    if (!value) return Currency.NGN;
    const normalized = value.toUpperCase();
    if (normalized !== Currency.NGN && normalized !== Currency.USD) {
      throw new BadRequestException('currency must be NGN or USD');
    }
    return normalized as Currency;
  }
}
