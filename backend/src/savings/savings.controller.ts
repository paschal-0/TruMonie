import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateVaultDto } from './dto/create-vault.dto';
import { VaultTransactionDto } from './dto/vault-transaction.dto';
import { SavingsService } from './savings.service';

@UseGuards(JwtAuthGuard)
@Controller('savings')
export class SavingsController {
  constructor(private readonly savingsService: SavingsService) {}

  @Post('vaults')
  create(@CurrentUser() user: User, @Body() dto: CreateVaultDto) {
    return this.savingsService.createVault(user.id, dto);
  }

  @Get('vaults')
  list(@CurrentUser() user: User) {
    return this.savingsService.listVaults(user.id);
  }

  @Post('vaults/deposit')
  deposit(@CurrentUser() user: User, @Body() dto: VaultTransactionDto) {
    return this.savingsService.deposit(
      user.id,
      dto.vaultId,
      dto.amountMinor.toString(),
      dto.currency,
      dto.reference
    );
  }

  @Post('vaults/withdraw')
  withdraw(@CurrentUser() user: User, @Body() dto: VaultTransactionDto) {
    return this.savingsService.withdraw(
      user.id,
      dto.vaultId,
      dto.amountMinor.toString(),
      dto.currency,
      dto.reference
    );
  }
}
