import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsService } from '../ledger/accounts.service';
import { JournalLine } from '../ledger/entities/journal-line.entity';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { Currency } from '../ledger/enums/currency.enum';
import { AccountType } from '../ledger/enums/account-type.enum';

@Injectable()
export class SpendingService {
  constructor(
    private readonly accountsService: AccountsService,
    @InjectRepository(JournalLine)
    private readonly lineRepo: Repository<JournalLine>
  ) {}

  async getUserDailyDebit(userId: string, currency: Currency): Promise<bigint> {
    const accounts = await this.accountsService.getUserAccounts(userId);
    const walletIds = accounts
      .filter((a) => a.currency === currency && a.type === AccountType.WALLET_MAIN)
      .map((a) => a.id);
    if (walletIds.length === 0) return 0n;

    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    const qb = this.lineRepo
      .createQueryBuilder('line')
      .select('SUM(line.amount_minor)', 'sum')
      .where('line.account_id IN (:...ids)', { ids: walletIds })
      .andWhere('line.direction = :dir', { dir: EntryDirection.DEBIT })
      .andWhere('line.created_at >= :start', { start: startOfDay });

    const res = await qb.getRawOne<{ sum: string | null }>();
    return res?.sum ? BigInt(res.sum) : 0n;
  }
}
