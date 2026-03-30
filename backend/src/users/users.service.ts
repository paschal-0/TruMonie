import { BadRequestException, ConflictException, Injectable, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';

import { CreateUserDto } from './dto/create-user.dto';
import { KycStatus, User, UserStatus } from './entities/user.entity';

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>
  ) {}

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

    const user = this.userRepository.create({
      phoneNumber: dto.phoneNumber,
      email: dto.email.toLowerCase(),
      username: dto.username.toLowerCase(),
      firstName: dto.firstName.trim(),
      lastName: dto.lastName.trim(),
      passwordHash,
      pinHash,
      status: UserStatus.PENDING,
      kycStatus: KycStatus.UNVERIFIED
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
      .addSelect(['user.passwordHash', 'user.pinHash'])
      .where('user.email = :identifier', { identifier: identifier.toLowerCase() })
      .orWhere('user.phoneNumber = :identifier', { identifier })
      .getOne();
  }

  async findByIdWithSecrets(id: string): Promise<User | null> {
    return this.userRepository
      .createQueryBuilder('user')
      .addSelect(['user.passwordHash', 'user.pinHash'])
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

  async assertValidTransactionPin(userId: string, pin: string) {
    const user = await this.findByIdWithSecrets(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }
    if (!user.pinHash) {
      throw new BadRequestException('Transaction PIN not set. Please create one first.');
    }
    const valid = await this.verifySecret(user.pinHash, pin);
    if (!valid) {
      throw new UnauthorizedException('Invalid transaction PIN');
    }
  }

  async setTransactionPin(userId: string, pin: string, currentPin?: string) {
    const user = await this.findByIdWithSecrets(userId);
    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (user.pinHash) {
      if (!currentPin) {
        throw new BadRequestException('Current PIN is required to change transaction PIN');
      }
      const validCurrentPin = await this.verifySecret(user.pinHash, currentPin);
      if (!validCurrentPin) {
        throw new UnauthorizedException('Current PIN is invalid');
      }
    }

    const pinHash = await this.hashSecret(pin);
    await this.userRepository.update({ id: userId }, { pinHash });
    return { hasTransactionPin: true };
  }

  private hashSecret(secret: string): Promise<string> {
    return argon2.hash(secret);
  }
}
