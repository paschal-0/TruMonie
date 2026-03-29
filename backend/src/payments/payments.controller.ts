import { Body, Controller, Headers, Param, Post, UseGuards } from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { BankResolveDto } from './dto/bank-resolve.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { InternalFundingDto } from './dto/internal-funding.dto';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('payments')
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('webhook/:provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Headers('x-signature') signature?: string
  ) {
    return this.paymentsService.creditWalletFromWebhook(provider, body, signature);
  }

  @Post('bank/resolve')
  async resolve(@Body() dto: BankResolveDto) {
    return this.paymentsService.resolveBankAccount(dto.bankCode, dto.accountNumber, dto.provider);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('internal/fund')
  async internalFund(@CurrentUser() user: User, @Body() dto: InternalFundingDto) {
    const targetUserId = dto.userId ?? user.id;
    return this.paymentsService.creditWallet({
      userId: targetUserId,
      amountMinor: dto.amountMinor.toString(),
      currency: dto.currency,
      reference: dto.reference ?? `INTERNAL-FUND-${Date.now()}`,
      description: dto.description ?? 'Internal funding',
      provider: 'internal',
      metadata: {
        channel: 'internal-fund-endpoint',
        initiatedByUserId: user.id,
        targetUserId
      }
    });
  }
}
