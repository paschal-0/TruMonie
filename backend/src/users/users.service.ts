import {
  BadRequestException,
  ConflictException,
  HttpStatus,
  Injectable,
  Logger,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';

import { SecurityErrorCode, SecurityException } from '../security/security.errors';
import { CreateUserDto } from './dto/create-user.dto';
import { AccountNumberSource, KycStatus, User, UserStatus } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);
  private readonly pinMaxWrongAttempts: number;
  private readonly pinLockoutMinutes: number[];
  private readonly pinAllowedLengths: number[];
  private readonly pinExpiryDays: number;

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly configService: ConfigService
  ) {
    this.pinMaxWrongAttempts = this.configService.get<number>('security.pinMaxWrongAttempts', 5);
    this.pinLockoutMinutes = this.parseNumberList(
      this.configService.get<string>('security.pinLockoutMinutesCsv', '30,60,1440')
    );
    this.pinAllowedLengths = this.parseNumberList(
      this.configService.get<string>('security.pinAllowedLengthsCsv', '4,6')
    );
    this.pinExpiryDays = this.configService.get<number>('security.pinExpiryDays', 90);
  }

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.userRepository.findOne({
      where: [
        { email: dto.email.toLowerCase() },
        { phoneNumber: dto.phoneNumber },
        { username: dto.username.toLowerCase() }
      ]
    });
    if (existing) {
      throw new ConflictException('User with email or phone already exists');
    }

    const passwordHash = await this.hashSecret(dto.password);
    const pinHash = dto.pin ? await this.hashSecret(dto.pin) : null;
    const now = new Date();

    const user = this.userRepository.create({
      phoneNumber: dto.phoneNumber,
      email: dto.email.toLowerCase(),
      username: dto.username.toLowerCase(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      passwordHash,
      pinHash,
      pinHistory: [],
      pinFailedAttempts: 0,
      pinLockLevel: 0,
      pinLockUntil: null,
      pinUpdatedAt: dto.pin ? now : null,
      status: UserStatus.PENDING,
      kycStatus: KycStatus.UNVERIFIED,
      accountNumberSource: dto.usePhoneAsAccountNumber
        ? AccountNumberSource.PHONE
        : AccountNumberSource.SYSTEM
    });

    const saved = await this.userRepository.save(user);
    this.logger.log(`Created user ${saved.id} (${saved.email})`);
    return saved;
  }

  async findById(id: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id } });
  }

  async findByEmailOrPhone(identifier: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: [{ email: identifier.toLowerCase() }, { phoneNumber: identifier }]
    });
  }

  async findByIdentifier(identifier: string): Promise<User | null> {
    return this.userRepository.findOne({
      where: [
        { email: identifier.toLowerCase() },
        { phoneNumber: identifier },
        { username: identifier.toLowerCase() }
      ]
    });
  }

  async findByEmailOrPhoneWithSecret(identifier: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.passwordHash',
        'user.pinHash',
        'user.pinHistory',
        'user.pinFailedAttempts',
        'user.pinLockUntil',
        'user.pinLockLevel'
      ])
      .where('user.email = :identifier', { identifier: identifier.toLowerCase() })
      .orWhere('user.phoneNumber = :identifier', { identifier })
      .getOne();
  }

  async findByIdWithSecrets(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect([
        'user.passwordHash',
        'user.pinHash',
        'user.pinHistory',
        'user.pinFailedAttempts',
        'user.pinLockUntil',
        'user.pinLockLevel'
      ])
      .where('user.id = :id', { id })
      .getOne();
  }

  async updateLastLogin(userId: string): Promise<void> {
    await this.userRepository.update({ id: userId }, { lastLoginAt: new Date() });
  }

  async updateKycStatus(
    userId: string,
    update: Partial<Pick<User, 'kycStatus' | 'limitTier' | 'status'>>
  ): Promise<void> {
    await this.userRepository.update({ id: userId }, update);
  }

  async verifySecret(hash: string | null, plain: string): Promise<boolean> {
    if (!hash) return false;
    return argon2.verify(hash, plain);
  }

  async updateStatus(userId: string, status: UserStatus) {
    await this.userRepository.update({ id: userId }, { status });
  }

  async hasTransactionPin(userId: string): Promise<boolean> {
    const user = await this.findByIdWithSecrets(userId);
    return Boolean(user?.pinHash);
  }

  async getTransactionPinStatus(userId: string) {
    const user = await this.findByIdWithSecrets(userId);
    const hasTransactionPin = Boolean(user?.pinHash);
    const requiresRotation = this.isPinExpired(user?.pinUpdatedAt ?? null);
    const lockedUntil = user?.pinLockUntil?.toISOString() ?? null;
    return { hasTransactionPin, requiresRotation, lockedUntil };
  }

  async assertValidTransactionPin(userId: string, pin: string) {
    const user = await this.findByIdWithSecrets(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.pinHash) {
      throw new BadRequestException('Transaction PIN not set. Please create one first.');
    }
    this.assertPinLength(pin);
    this.assertPinNotLocked(user);

    const valid = await this.verifySecret(user.pinHash, pin);
    if (!valid) {
      await this.recordFailedPinAttempt(user);
    } else if ((user.pinFailedAttempts ?? 0) > 0 || user.pinLockUntil) {
      await this.userRepository.update(
        { id: user.id },
        {
          pinFailedAttempts: 0,
          pinLockUntil: null
        }
      );
    }
  }

  async setTransactionPin(userId: string, pin: string, currentPin?: string) {
    this.assertPinLength(pin);
    const user = await this.findByIdWithSecrets(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.pinHash) {
      if (!currentPin) {
        throw new BadRequestException('Current PIN is required to change transaction PIN');
      }
      await this.assertValidTransactionPin(userId, currentPin);
    }

    await this.assertNotRecentPin(user, pin);
    const pinHash = await this.hashSecret(pin);
    const history = [user.pinHash, ...(user.pinHistory ?? [])].filter((value): value is string => Boolean(value));
    await this.userRepository.update(
      { id: userId },
      {
        pinHash,
        pinHistory: history.slice(0, 3),
        pinUpdatedAt: new Date(),
        pinFailedAttempts: 0,
        pinLockUntil: null,
        pinLockLevel: 0
      }
    );
    return { hasTransactionPin: true, requiresRotation: false };
  }

  async setLoginPassword(userId: string, password: string, currentPassword?: string) {
    const user = await this.findByIdWithSecrets(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (currentPassword) {
      const validCurrentPassword = await this.verifySecret(user.passwordHash, currentPassword);
      if (!validCurrentPassword) {
        throw new UnauthorizedException('Current password is invalid');
      }
    }

    const passwordHash = await this.hashSecret(password);
    await this.userRepository.update({ id: userId }, { passwordHash });
    return { passwordUpdated: true };
  }

  private hashSecret(secret: string): Promise<string> {
    return argon2.hash(secret, {
      type: argon2.argon2id,
      memoryCost: 65_536,
      timeCost: 3,
      parallelism: 4
    });
  }

  private async assertNotRecentPin(user: User, pin: string) {
    const recentHashes = [user.pinHash, ...(user.pinHistory ?? [])].filter(
      (value): value is string => Boolean(value)
    );
    for (const hash of recentHashes.slice(0, 3)) {
      const reused = await this.verifySecret(hash, pin);
      if (reused) {
        throw new BadRequestException('PIN cannot reuse any of your last 3 PINs');
      }
    }
  }

  private assertPinLength(pin: string) {
    if (!/^\d+$/.test(pin)) {
      throw new BadRequestException('PIN must contain only digits');
    }
    if (!this.pinAllowedLengths.includes(pin.length)) {
      throw new BadRequestException(
        `PIN length must be one of: ${this.pinAllowedLengths.join(', ')} digits`
      );
    }
  }

  private assertPinNotLocked(user: User) {
    if (!user.pinLockUntil) return;
    if (user.pinLockUntil.getTime() <= Date.now()) return;
    const retryAfterSeconds = Math.ceil((user.pinLockUntil.getTime() - Date.now()) / 1000);
    throw new SecurityException(
      SecurityErrorCode.ACCOUNT_LOCKED,
      'Account locked - too many failed attempts',
      HttpStatus.TOO_MANY_REQUESTS,
      { retryAfterSeconds }
    );
  }

  private async recordFailedPinAttempt(user: User): Promise<never> {
    const attempts = (user.pinFailedAttempts ?? 0) + 1;
    if (attempts >= this.pinMaxWrongAttempts) {
      const nextLockLevel = Math.min((user.pinLockLevel ?? 0) + 1, this.pinLockoutMinutes.length - 1);
      const lockMinutes = this.pinLockoutMinutes[nextLockLevel] ?? 30;
      const lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
      await this.userRepository.update(
        { id: user.id },
        {
          pinFailedAttempts: 0,
          pinLockUntil: lockUntil,
          pinLockLevel: nextLockLevel
        }
      );
      throw new SecurityException(
        SecurityErrorCode.ACCOUNT_LOCKED,
        'Account locked - too many failed attempts',
        HttpStatus.TOO_MANY_REQUESTS,
        { retryAfterSeconds: lockMinutes * 60 }
      );
    }

    await this.userRepository.update({ id: user.id }, { pinFailedAttempts: attempts });
    throw new SecurityException(
      SecurityErrorCode.INVALID_PIN,
      'Invalid PIN',
      HttpStatus.UNAUTHORIZED,
      { remainingAttempts: this.pinMaxWrongAttempts - attempts }
    );
  }

  private isPinExpired(pinUpdatedAt: Date | null) {
    if (!pinUpdatedAt) return false;
    const maxAgeMs = this.pinExpiryDays * 24 * 60 * 60 * 1000;
    return Date.now() - pinUpdatedAt.getTime() >= maxAgeMs;
  }

  private parseNumberList(value: string): number[] {
    return value
      .split(',')
      .map((entry) => Number.parseInt(entry.trim(), 10))
      .filter((entry) => Number.isFinite(entry) && entry > 0);
  }
}
