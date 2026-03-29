import { Column, Entity, JoinColumn, OneToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'user_kyc_data' })
export class UserKycData extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'varchar', length: 512, nullable: true })
  bvnEncrypted!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  ninEncrypted!: string | null;

  @Column({ type: 'varchar', length: 1024, nullable: true })
  addressEncrypted!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  dobEncrypted!: string | null;

  @Column({ type: 'varchar', length: 512, nullable: true })
  selfieUrl!: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;
}
