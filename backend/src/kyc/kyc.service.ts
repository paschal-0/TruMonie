import { BadRequestException, Inject, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { UsersService } from '../users/users.service';
import { KycStatus, LimitTier } from '../users/entities/user.entity';
import { UserKycData } from './entities/user-kyc-data.entity';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { PiiCryptoService } from './pii-crypto.service';
import { KycProvider } from './interfaces/kyc-provider.interface';
import { KYC_PROVIDER } from './kyc.constants';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    private readonly usersService: UsersService,
    @InjectRepository(UserKycData) private readonly kycRepo: Repository<UserKycData>,
    private readonly piiCrypto: PiiCryptoService,
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider
  ) {}

  async verify(userId: string, dto: VerifyKycDto) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    const res = await this.provider.verifyBvnAndNin({
      bvn: dto.bvn,
      nin: dto.nin,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: dto.dateOfBirth
    });

    if (!res.match) {
      throw new BadRequestException('KYC verification failed');
    }

    const existing = await this.kycRepo.findOne({ where: { userId } });
    const encrypted = {
      bvnEncrypted: this.piiCrypto.encrypt(dto.bvn),
      ninEncrypted: this.piiCrypto.encrypt(dto.nin),
      dobEncrypted: this.piiCrypto.encrypt(dto.dateOfBirth),
      addressEncrypted: dto.address ? this.piiCrypto.encrypt(dto.address) : null
    };

    if (existing) {
      await this.kycRepo.update({ userId }, { ...encrypted, selfieUrl: dto.selfieUrl ?? null });
    } else {
      await this.kycRepo.save(
        this.kycRepo.create({
          userId,
          ...encrypted,
          selfieUrl: dto.selfieUrl ?? null
        })
      );
    }

    await this.usersService.updateKycStatus(userId, {
      kycStatus: KycStatus.VERIFIED,
      limitTier: LimitTier.TIER2
    });

    this.logger.log(`KYC verified for user ${userId} ref=${res.reference}`);
    return { status: 'verified', reference: res.reference };
  }
}
