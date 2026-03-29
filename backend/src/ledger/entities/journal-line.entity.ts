import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { Account } from './account.entity';
import { JournalEntry } from './journal-entry.entity';
import { EntryDirection } from '../enums/entry-direction.enum';
import { Currency } from '../enums/currency.enum';

@Entity({ name: 'journal_lines' })
export class JournalLine extends BaseEntity {
  @ManyToOne(() => JournalEntry, (entry) => entry.lines, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry;

  @Column({ type: 'uuid' })
  journalEntryId!: string;

  @ManyToOne(() => Account)
  @JoinColumn({ name: 'account_id' })
  account!: Account;

  @Column({ type: 'uuid' })
  accountId!: string;

  @Column({ type: 'enum', enum: EntryDirection })
  direction!: EntryDirection;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'enum', enum: Currency })
  currency!: Currency;

  @Column({ type: 'varchar', length: 255, nullable: true })
  memo!: string | null;
}
