import { Column, Entity, Index, OneToMany } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { JournalStatus } from '../enums/journal-status.enum';
import { JournalLine } from './journal-line.entity';

@Entity({ name: 'journal_entries' })
export class JournalEntry extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  reference!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 128, nullable: true })
  idempotencyKey!: string | null;

  @Column({ type: 'enum', enum: JournalStatus, default: JournalStatus.POSTED })
  status!: JournalStatus;

  @Column({ type: 'varchar', length: 255, nullable: true })
  description!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @OneToMany(() => JournalLine, (line) => line.journalEntry, { cascade: ['insert'] })
  lines!: JournalLine[];
}
