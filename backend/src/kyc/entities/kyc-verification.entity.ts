import { Column, Entity, Index, JoinColumn, ManyToOne } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';
import { User } from '../../users/entities/user.entity';

export enum KycVerificationType {
  BVN = 'BVN',
  NIN = 'NIN',
  LIVENESS = 'LIVENESS',
  ADDRESS = 'ADDRESS',
  GOVERNMENT_ID = 'GOVERNMENT_ID'
}

export enum KycVerificationStatus {
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED',
  FAILED = 'FAILED',
  EXPIRED = 'EXPIRED'
}

@Entity({ name: 'kyc_verifications' })
@Index(['userId', 'type', 'status'])
export class KycVerification extends BaseEntity {
  @Column({ type: 'uuid' })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ type: 'enum', enum: KycVerificationType })
  type!: KycVerificationType;

  @Column({ type: 'varchar', length: 32 })
  provider!: string;

  @Column({ type: 'varchar', length: 512, nullable: true })
  referenceEncrypted!: string | null;

  @Column({ type: 'int', nullable: true })
  matchScore!: number | null;

  @Column({ type: 'enum', enum: KycVerificationStatus, default: KycVerificationStatus.PENDING })
  status!: KycVerificationStatus;

  @Column({ type: 'jsonb', nullable: true })
  metadata!: Record<string, unknown> | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  verifiedAt!: Date | null;

  @Column({ type: 'timestamp with time zone', nullable: true })
  expiresAt!: Date | null;
}
