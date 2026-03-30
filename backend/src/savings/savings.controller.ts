import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultTransactionDto } from './dto/vault-transaction.dto';
import { SavingsService } from './savings.service';
import { NotificationsService } from '../notifications/notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('savings')
export class SavingsController {
  constructor(
    private readonly savingsService: SavingsService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService
  ) {}

  @Post('vaults')
  create(@CurrentUser() user: User, @Body() dto: CreateVaultDto) {
    return this.savingsService.createVault(user.id, dto);
  }

  @Get('vaults')
  list(@CurrentUser() user: User) {
    return this.savingsService.listVaults(user.id);
  }

  @Post('vaults/deposit')
  async deposit(@CurrentUser() user: User, @Body() dto: VaultTransactionDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const tx = await this.savingsService.deposit(
      user.id,
      dto.vaultId,
      dto.amountMinor.toString(),
      dto.currency,
      dto.reference
    );
    await this.notificationsService.send(
      user.id,
      'SAVINGS_DEPOSIT',
      `Savings deposit of ${dto.amountMinor} ${dto.currency} completed`
    );
    return tx;
  }

  @Post('vaults/withdraw')
  async withdraw(@CurrentUser() user: User, @Body() dto: VaultTransactionDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const tx = await this.savingsService.withdraw(
      user.id,
      dto.vaultId,
      dto.amountMinor.toString(),
      dto.currency,
      dto.reference
    );
    await this.notificationsService.send(
      user.id,
      'SAVINGS_WITHDRAW',
      `Savings withdrawal of ${dto.amountMinor} ${dto.currency} completed`
    );
    return tx;
  }
}
