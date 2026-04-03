import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { EntryDirection } from '../enums/entry-direction.enum';

@Entity({ name: 'gl_postings' })
@Index(['transactionId'])
@Index(['glAccountCode', 'valueDate'])
export class GlPosting extends BaseEntity {
  @Column({ type: 'uuid' })
  transactionId!: string;

  @Column({ type: 'varchar', length: 10 })
  glAccountCode!: string;

  @Column({ type: 'enum', enum: EntryDirection, enumName: 'gl_entry_type_enum' })
  entryType!: EntryDirection;

  @Column({ type: 'bigint' })
  amountMinor!: string;

  @Column({ type: 'text' })
  narration!: string;

  @Column({ type: 'date' })
  valueDate!: string;

  @Column({ type: 'varchar', length: 50 })
  postedBy!: string;
}

