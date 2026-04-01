import {
  BadRequestException,
  Body,
  Controller,
  ForbiddenException,
  HttpStatus,
  Post,
  UseGuards
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { AccountsService } from '../ledger/accounts.service';
import { LedgerService } from '../ledger/ledger.service';
import { LimitsService } from '../limits/limits.service';
import { P2PTransferDto } from './dto/p2p-transfer.dto';
import { BankTransferDto } from './dto/bank-transfer.dto';
import { Currency } from '../ledger/enums/currency.enum';
import { PaymentsService } from './payments.service';
import { VelocityService } from '../risk/velocity.service';
import { NotificationsService } from '../notifications/notifications.service';
import { CircuitBreakerService } from '../risk/circuit-breaker.service';
import { WalletErrorCode, WalletException } from '../ledger/wallet.errors';

@UseGuards(JwtAuthGuard)
@Controller('payments')
export class TransfersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
    private readonly limitsService: LimitsService,
    private readonly paymentsService: PaymentsService,
    private readonly velocityService: VelocityService,
    private readonly notificationsService: NotificationsService,
    private readonly circuitBreakerService: CircuitBreakerService
  ) {}

  @Post('p2p')
  async p2p(@CurrentUser() user: User, @Body() dto: P2PTransferDto) {
    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('User is frozen');
    }
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const senderWallet = await this.requireWallet(user.id, dto.currency);
    const recipient = await this.usersService.findByIdentifier(dto.recipientIdentifier);
    if (!recipient) {
      throw new BadRequestException('Recipient not found');
    }
    const recipientWallet = await this.requireWallet(recipient.id, dto.currency);
    this.limitsService.assertWithinMaxBalance(
      recipient.limitTier,
      recipientWallet.balanceMinor,
      dto.amountMinor.toString()
    );
    await this.circuitBreakerService.assertWithinNewDeviceCap(user.id, dto.amountMinor.toString());
    await this.circuitBreakerService.assertWithinNewDeviceCap(recipient.id, dto.amountMinor.toString());

    await this.velocityService.assertWithinLimits(
      user.id,
      dto.currency,
      dto.amountMinor.toString()
    );
    await this.limitsService.assertWithinLimits(
      user.id,
      user.limitTier,
      dto.amountMinor.toString(),
      dto.currency
    );

    const entry = await this.ledgerService.transfer({
      sourceAccountId: senderWallet.id,
      destinationAccountId: recipientWallet.id,
      amountMinor: dto.amountMinor.toString(),
      currency: dto.currency,
      description: dto.description ?? `P2P to ${recipient.username ?? recipient.email}`,
      idempotencyKey: dto.idempotencyKey
    });
    await this.notificationsService.send(
      user.id,
      'TRANSFER_OUT',
      `Sent ${dto.amountMinor} ${dto.currency} to ${recipient.username ?? recipient.email}`
    );
    await this.notificationsService.send(
      recipient.id,
      'TRANSFER_IN',
      `Received ${dto.amountMinor} ${dto.currency} from ${user.username ?? user.email}`
    );
    return entry;
  }

  @Post('bank-transfer')
  async bankTransfer(@CurrentUser() user: User, @Body() dto: BankTransferDto) {
    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('User is frozen');
    }
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const senderWallet = await this.requireWallet(user.id, dto.currency);
    await this.circuitBreakerService.assertWithinNewDeviceCap(user.id, dto.amountMinor.toString());
    await this.velocityService.assertWithinLimits(
      user.id,
      dto.currency,
      dto.amountMinor.toString()
    );
    await this.limitsService.assertWithinLimits(
      user.id,
      user.limitTier,
      dto.amountMinor.toString(),
      dto.currency
    );

    const provider = dto.provider ?? this.paymentsService.getDefaultProviderName();
    const payout = await this.paymentsService.initiatePayout(
      provider,
      user.id,
      senderWallet.id,
      dto.amountMinor.toString(),
      dto.currency,
      {
        bankCode: dto.bankCode,
        accountNumber: dto.accountNumber,
        accountName: dto.accountName
      },
      dto.narration
    );
    await this.notificationsService.send(
      user.id,
      'BANK_TRANSFER',
      `Bank transfer ${dto.amountMinor} ${dto.currency} initiated to ${dto.accountNumber}`
    );
    return payout;
  }

  private async requireWallet(userId: string, currency: Currency) {
    const accounts = await this.accountsService.getUserAccounts(userId);
    const wallet = accounts.find((a) => a.currency === currency);
    if (!wallet) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Wallet not found',
        HttpStatus.NOT_FOUND
      );
    }
    return wallet;
  }
}
