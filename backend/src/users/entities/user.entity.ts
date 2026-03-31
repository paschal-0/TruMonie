import { Column, Entity, Index } from 'typeorm';

import { BaseEntity } from '../../database/base.entity';

export enum UserStatus {
  PENDING = 'PENDING',
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED'
}

export enum KycStatus {
  UNVERIFIED = 'UNVERIFIED',
  PENDING = 'PENDING',
  VERIFIED = 'VERIFIED'
}

export enum LimitTier {
  TIER0 = 'TIER0',
  TIER1 = 'TIER1',
  TIER2 = 'TIER2',
  TIER3 = 'TIER3'
}

export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN'
}

export enum AccountNumberSource {
  SYSTEM = 'SYSTEM',
  PHONE = 'PHONE'
}

@Entity({ name: 'users' })
export class User extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'varchar', length: 20 })
  phoneNumber!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 50 })
  username!: string;

  @Column({ type: 'varchar', length: 255, select: false })
  passwordHash!: string;

  @Column({ type: 'varchar', length: 255, nullable: true, select: false })
  pinHash!: string | null;

  @Column({ type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status!: UserStatus;

  @Column({ type: 'enum', enum: KycStatus, default: KycStatus.UNVERIFIED })
  kycStatus!: KycStatus;

  @Column({ type: 'timestamp with time zone', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'enum', enum: UserRole, default: UserRole.USER })
  role!: UserRole;

  @Column({ type: 'enum', enum: LimitTier, default: LimitTier.TIER0 })
  limitTier!: LimitTier;

  @Column({ type: 'varchar', length: 16, default: AccountNumberSource.SYSTEM })
  accountNumberSource!: AccountNumberSource;
}
