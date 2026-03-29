import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { createHash } from 'crypto';

import { AccountsService } from '../ledger/accounts.service';
import { LedgerService } from '../ledger/ledger.service';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { Currency } from '../ledger/enums/currency.enum';
import { SavingsVault, VaultStatus } from './entities/savings-vault.entity';
import { SavingsDirection, SavingsTransaction } from './entities/savings-transaction.entity';
import { CreateVaultDto } from './dto/create-vault.dto';

@Injectable()
export class SavingsService {
  constructor(
    @InjectRepository(SavingsVault)
    private readonly vaultRepo: Repository<SavingsVault>,
    @InjectRepository(SavingsTransaction)
    private readonly txRepo: Repository<SavingsTransaction>,
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService
  ) {}

  async createVault(userId: string, dto: CreateVaultDto) {
    const account = await this.accountsService.createSavingsAccount(userId, dto.currency, dto.name);
    const vault = this.vaultRepo.create({
      userId,
      accountId: account.id,
      name: dto.name,
      currency: dto.currency,
      targetAmountMinor: dto.targetAmountMinor.toString(),
      lockedUntil: dto.lockedUntil ?? null,
      status: VaultStatus.ACTIVE,
      balanceMinor: '0'
    });
    return this.vaultRepo.save(vault);
  }

  async listVaults(userId: string) {
    return this.vaultRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async deposit(userId: string, vaultId: string, amountMinor: string, currency: Currency, reference?: string) {
    const vault = await this.vaultRepo.findOne({ where: { id: vaultId, userId } });
    if (!vault) throw new BadRequestException('Vault not found');
    if (vault.currency !== currency) throw new BadRequestException('Currency mismatch');
    if (vault.status !== VaultStatus.ACTIVE) throw new BadRequestException('Vault not active');

    const wallets = await this.accountsService.getUserAccounts(userId);
    const wallet = wallets.find((a) => a.currency === currency);
    if (!wallet) throw new BadRequestException('Wallet not found');

    const ref = reference ?? this.hashRef(vaultId, amountMinor);
    await this.ledgerService.postEntry({
      reference: `SAV-${ref}`,
      idempotencyKey: `SAV-${ref}`,
      description: `Savings deposit ${vault.name}`,
      enforceNonNegative: true,
      lines: [
        {
          accountId: wallet.id,
          direction: EntryDirection.DEBIT,
          amountMinor,
          currency
        },
        {
          accountId: vault.accountId,
          direction: EntryDirection.CREDIT,
          amountMinor,
          currency
        }
      ]
    });

    vault.balanceMinor = (BigInt(vault.balanceMinor) + BigInt(amountMinor)).toString();
    await this.vaultRepo.save(vault);
    await this.txRepo.save(
      this.txRepo.create({
        vaultId: vault.id,
        userId,
        direction: SavingsDirection.DEPOSIT,
        amountMinor,
        currency,
        reference: ref
      })
    );
    return vault;
  }

  async withdraw(userId: string, vaultId: string, amountMinor: string, currency: Currency, reference?: string) {
    const vault = await this.vaultRepo.findOne({ where: { id: vaultId, userId } });
    if (!vault) throw new BadRequestException('Vault not found');
    if (vault.currency !== currency) throw new BadRequestException('Currency mismatch');
    if (vault.lockedUntil && vault.lockedUntil > new Date()) {
      throw new BadRequestException('Vault is locked');
    }
    if (BigInt(vault.balanceMinor) < BigInt(amountMinor)) {
      throw new BadRequestException('Insufficient vault balance');
    }

    const wallets = await this.accountsService.getUserAccounts(userId);
    const wallet = wallets.find((a) => a.currency === currency);
    if (!wallet) throw new BadRequestException('Wallet not found');

    const ref = reference ?? this.hashRef(vaultId, amountMinor);
    await this.ledgerService.postEntry({
      reference: `SAV-W-${ref}`,
      idempotencyKey: `SAV-W-${ref}`,
      description: `Savings withdraw ${vault.name}`,
      enforceNonNegative: true,
      lines: [
        {
          accountId: vault.accountId,
          direction: EntryDirection.DEBIT,
          amountMinor,
          currency
        },
        {
          accountId: wallet.id,
          direction: EntryDirection.CREDIT,
          amountMinor,
          currency
        }
      ]
    });

    vault.balanceMinor = (BigInt(vault.balanceMinor) - BigInt(amountMinor)).toString();
    if (BigInt(vault.balanceMinor) <= 0n) {
      vault.status = VaultStatus.COMPLETED;
    }
    await this.vaultRepo.save(vault);
    await this.txRepo.save(
      this.txRepo.create({
        vaultId: vault.id,
        userId,
        direction: SavingsDirection.WITHDRAW,
        amountMinor,
        currency,
        reference: ref
      })
    );
    return vault;
  }

  private hashRef(vaultId: string, amountMinor: string) {
    return createHash('sha256').update(`${vaultId}-${amountMinor}-${Date.now()}`).digest('hex').slice(0, 20);
  }
}
