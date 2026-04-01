import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateVirtualAccountDto } from '../ledger/dto/create-virtual-account.dto';
import { FundWalletDto } from '../ledger/dto/fund-wallet.dto';
import { User } from '../users/entities/user.entity';
import { PaymentsService } from './payments.service';

@UseGuards(JwtAuthGuard)
@Controller(['wallets', 'wallet'])
export class WalletFundingController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('fund')
  async fund(@CurrentUser() user: User, @Body() dto: FundWalletDto) {
    return this.paymentsService.fundWallet({
      userId: user.id,
      walletId: dto.walletId,
      amountMinor: dto.amount,
      currency: dto.currency,
      channel: dto.channel,
      cardToken: dto.cardToken,
      idempotencyKey: dto.idempotencyKey,
      providerName: dto.provider
    });
  }

  @Post('virtual-account')
  async createVirtualAccount(@CurrentUser() user: User, @Body() dto: CreateVirtualAccountDto) {
    return this.paymentsService.createVirtualAccount({
      userId: user.id,
      walletId: dto.walletId,
      currency: dto.currency,
      providerName: dto.provider
    });
  }
}
