import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Query,
  UseGuards
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AccountsService } from './accounts.service';
import { AccountsPolicy } from './accounts.policy';
import { WalletTransactionsQueryDto } from './dto/wallet-transactions-query.dto';
import { Currency } from './enums/currency.enum';

@UseGuards(JwtAuthGuard)
@Controller(['wallets', 'wallet'])
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

  @Get(':accountId/transactions')
  async transactions(
    @CurrentUser() user: User,
    @Param('accountId') accountId: string,
    @Query() query: WalletTransactionsQueryDto
  ) {
    await this.accountsPolicy.assertOwnership(user.id, accountId);
    return this.accountsService.getTransactions(accountId, {
      startDate: query.start_date,
      endDate: query.end_date,
      category: query.category,
      status: query.status,
      type: query.type,
      minAmountMinor: query.min_amount,
      maxAmountMinor: query.max_amount,
      page: query.page,
      perPage: query.per_page
    });
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
