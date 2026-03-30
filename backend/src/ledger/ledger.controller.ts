import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { TransferDto } from './dto/transfer.dto';
import { LedgerService } from './ledger.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AccountsPolicy } from './accounts.policy';
import { UsersService } from '../users/users.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('ledger')
export class LedgerController {
  constructor(
    private readonly ledgerService: LedgerService,
    private readonly accountsPolicy: AccountsPolicy,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService
  ) {}

  @UseGuards(JwtAuthGuard)
  @Post('transfer')
  async transfer(@CurrentUser() user: User, @Body() dto: TransferDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    await this.accountsPolicy.assertOwnership(user.id, dto.sourceAccountId);
    const entry = await this.ledgerService.transfer({
      sourceAccountId: dto.sourceAccountId,
      destinationAccountId: dto.destinationAccountId,
      amountMinor: dto.amountMinor.toString(),
      currency: dto.currency,
      description: dto.description,
      idempotencyKey: dto.idempotencyKey,
      feeAccountId: dto.feeAccountId,
      feeAmountMinor: dto.feeAmountMinor?.toString()
    });
    await this.notificationsService.send(
      user.id,
      'LEDGER_TRANSFER',
      `Transfer ${dto.amountMinor} ${dto.currency} completed`
    );
    return entry;
  }
}
