import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { In, Repository } from 'typeorm';

import { REDIS_CLIENT } from '../redis/redis.module';
import { LimitsService } from '../limits/limits.service';
import { SpendingService } from '../limits/spending.service';
import { Currency } from '../ledger/enums/currency.enum';
import { AccountsService } from '../ledger/accounts.service';
import { UsersService } from '../users/users.service';
import {
  AccountNumberSource,
  KycStatus,
  LimitTier,
  UserStatus
} from '../users/entities/user.entity';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { ValidateBvnDto } from './dto/validate-bvn.dto';
import { ValidateNinDto } from './dto/validate-nin.dto';
import { VerifyGovernmentIdDto } from './dto/verify-government-id.dto';
import { VerifyAddressDto } from './dto/verify-address.dto';
import { TierUpgradeDto } from './dto/tier-upgrade.dto';
import { UserKycData } from './entities/user-kyc-data.entity';
import {
  KycVerification,
  KycVerificationStatus,
  KycVerificationType
} from './entities/kyc-verification.entity';
import { PiiCryptoService } from './pii-crypto.service';
import { KycProvider } from './interfaces/kyc-provider.interface';
import { KYC_PROVIDER } from './kyc.constants';

interface LivenessSession {
  sessionId: string;
  userId: string;
  sessionType: string;
  challenges: Array<{ type: string; durationMs: number }>;
  expiresAt: string;
}

type KycDecision = 'APPROVE' | 'MANUAL_REVIEW' | 'REJECT';

export interface IdentityValidationResult {
  verificationId: string;
  passed: boolean;
  matchScore: number;
  reference: string;
  metadata: Record<string, unknown>;
}

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);
  private readonly livenessTtlSeconds = 300;

  constructor(
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly limitsService: LimitsService,
    private readonly spendingService: SpendingService,
    @InjectRepository(UserKycData) private readonly kycRepo: Repository<UserKycData>,
    @InjectRepository(KycVerification)
    private readonly verificationRepo: Repository<KycVerification>,
    private readonly piiCrypto: PiiCryptoService,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: {
      get: (key: string) => Promise<string | null>;
      setex: (key: string, ttl: number, value: string) => Promise<void>;
      del: (key: string) => Promise<number>;
    },
    @Inject(KYC_PROVIDER) private readonly provider: KycProvider
  ) {}

  async verify(userId: string, dto: VerifyKycDto) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new BadRequestException('User not found');
    }

    await this.ensureIdentifierNotLinked('BVN', this.piiCrypto.hash(dto.bvn), userId);
    await this.ensureIdentifierNotLinked('NIN', this.piiCrypto.hash(dto.nin), userId);

    const bvn = await this.validateBvn(userId, {
      bvn: dto.bvn,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: dto.dateOfBirth,
      phone: user.phoneNumber
    });
    const nin = await this.validateNin(userId, {
      nin: dto.nin,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth: dto.dateOfBirth
    });

    if (!bvn.passed || !nin.passed) {
      throw new BadRequestException({
        status: 'failed',
        decision: 'REJECT' as KycDecision,
        tier: user.limitTier,
        references: [bvn.reference, nin.reference],
        reason: 'IDENTITY_MISMATCH',
        checks: {
          bvn: { passed: bvn.passed, matchScore: bvn.matchScore, reference: bvn.reference },
          nin: { passed: nin.passed, matchScore: nin.matchScore, reference: nin.reference }
        }
      });
    }

    const faceDecision = await this.evaluateFaceComparison(
      userId,
      dto.selfieUrl,
      bvn.metadata,
      nin.metadata
    );

    await this.upsertKycData(userId, {
      bvn: dto.bvn,
      nin: dto.nin,
      dateOfBirth: dto.dateOfBirth,
      address: dto.address,
      selfieUrl: dto.selfieUrl
    });

    if (faceDecision.decision === 'MANUAL_REVIEW') {
      await this.usersService.updateKycStatus(userId, {
        kycStatus: KycStatus.PENDING,
        status: UserStatus.PENDING
      });
      this.logger.warn(
        `KYC manual review for user ${userId} bvnRef=${bvn.reference} ninRef=${nin.reference} reason=${faceDecision.reason}`
      );
      return {
        status: 'pending_review',
        decision: faceDecision.decision,
        tier: user.limitTier,
        references: [bvn.reference, nin.reference, faceDecision.reference].filter(Boolean),
        reason: faceDecision.reason,
        faceComparison: faceDecision.details
      };
    }

    await this.usersService.updateKycStatus(userId, {
      kycStatus: KycStatus.VERIFIED,
      limitTier: LimitTier.TIER1,
      status: UserStatus.ACTIVE
    });
    await this.accountsService.ensureUserBaseAccounts(userId, {
      accountNumberSource:
        user.accountNumberSource === AccountNumberSource.PHONE ? 'PHONE' : 'SYSTEM',
      phoneNumber: user.phoneNumber
    });

    this.logger.log(`KYC verified for user ${userId} bvnRef=${bvn.reference} ninRef=${nin.reference}`);
    return {
      status: 'verified',
      decision: 'APPROVE' as KycDecision,
      tier: LimitTier.TIER1,
      references: [bvn.reference, nin.reference, faceDecision.reference].filter(Boolean),
      faceComparison: faceDecision.details
    };
  }

  async validateBvn(userId: string, dto: ValidateBvnDto): Promise<IdentityValidationResult> {
    const firstName = dto.firstName?.trim();
    const lastName = dto.lastName?.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException('firstName and lastName are required for BVN validation');
    }
    await this.ensureIdentifierNotLinked('BVN', this.piiCrypto.hash(dto.bvn), userId);
    const providerResult = this.provider.verifyBvn
      ? await this.provider.verifyBvn({
        bvn: dto.bvn,
          firstName,
          lastName,
          dateOfBirth: dto.dateOfBirth,
          phone: dto.phone
        })
      : await this.provider.verifyBvnAndNin({
          bvn: dto.bvn,
          nin: '',
          firstName,
          lastName,
          dateOfBirth: dto.dateOfBirth
        });

    const score = this.calculateMatchScore(
      {
        firstName,
        lastName,
        dateOfBirth: dto.dateOfBirth,
        phone: dto.phone
      },
      providerResult.metadata
    );
    const passed = providerResult.match && score >= 75;
    const verification = await this.recordVerification({
      userId,
      type: KycVerificationType.BVN,
      provider: this.provider.name,
      reference: dto.bvn,
      matchScore: score,
      status: passed ? KycVerificationStatus.VERIFIED : KycVerificationStatus.FAILED,
      metadata: providerResult.metadata
    });

    return {
      verificationId: verification.id,
      passed,
      matchScore: score,
      reference: providerResult.reference,
      metadata: providerResult.metadata
    };
  }

  async validateNin(userId: string, dto: ValidateNinDto): Promise<IdentityValidationResult> {
    const firstName = dto.firstName?.trim();
    const lastName = dto.lastName?.trim();
    if (!firstName || !lastName) {
      throw new BadRequestException('firstName and lastName are required for NIN validation');
    }
    await this.ensureIdentifierNotLinked('NIN', this.piiCrypto.hash(dto.nin), userId);
    const providerResult = this.provider.verifyNin
      ? await this.provider.verifyNin({
          nin: dto.nin,
          firstName,
          lastName,
          dateOfBirth: dto.dateOfBirth
        })
      : await this.provider.verifyBvnAndNin({
          bvn: '',
          nin: dto.nin,
          firstName,
          lastName,
          dateOfBirth: dto.dateOfBirth ?? new Date().toISOString().slice(0, 10)
        });

    const score = this.calculateMatchScore(
      {
        firstName,
        lastName,
        dateOfBirth: dto.dateOfBirth
      },
      providerResult.metadata
    );
    const passed = providerResult.match && score >= 75;
    const verification = await this.recordVerification({
      userId,
      type: KycVerificationType.NIN,
      provider: this.provider.name,
      reference: dto.nin,
      matchScore: score,
      status: passed ? KycVerificationStatus.VERIFIED : KycVerificationStatus.FAILED,
      metadata: providerResult.metadata
    });

    return {
      verificationId: verification.id,
      passed,
      matchScore: score,
      reference: providerResult.reference,
      metadata: providerResult.metadata
    };
  }

  async verifyGovernmentId(userId: string, dto: VerifyGovernmentIdDto) {
    const passed = dto.faceMatchScore >= 0.85;
    const verification = await this.recordVerification({
      userId,
      type: KycVerificationType.GOVERNMENT_ID,
      provider: 'INTERNAL',
      reference: `${dto.documentType}:${dto.documentNumber}`,
      matchScore: Math.round(dto.faceMatchScore * 100),
      status: passed ? KycVerificationStatus.VERIFIED : KycVerificationStatus.FAILED,
      metadata: {
        documentType: dto.documentType,
        selfieUrl: dto.selfieUrl ?? null
      }
    });
    return {
      verificationId: verification.id,
      passed,
      faceMatchScore: dto.faceMatchScore
    };
  }

  async verifyAddress(userId: string, dto: VerifyAddressDto) {
    const verification = await this.recordVerification({
      userId,
      type: KycVerificationType.ADDRESS,
      provider: dto.provider ?? 'INTERNAL',
      reference: dto.proofReference,
      status: KycVerificationStatus.VERIFIED,
      metadata: { proofType: dto.proofType }
    });
    return {
      verificationId: verification.id,
      passed: true
    };
  }

  async startLivenessSession(userId: string, sessionType: string) {
    const challenges = this.randomChallenges();
    const sessionId = randomUUID();
    const expiresAt = new Date(Date.now() + this.livenessTtlSeconds * 1000).toISOString();
    const session: LivenessSession = {
      sessionId,
      userId,
      sessionType,
      challenges,
      expiresAt
    };
    await this.redisClient.setex(this.livenessKey(sessionId), this.livenessTtlSeconds, JSON.stringify(session));
    return session;
  }

  async submitLivenessSession(
    userId: string,
    sessionId: string,
    frames: string[],
    deviceSensors: Record<string, unknown>
  ) {
    const stored = await this.redisClient.get(this.livenessKey(sessionId));
    if (!stored) {
      throw new BadRequestException('Liveness session expired or not found');
    }
    const parsed = JSON.parse(stored) as LivenessSession;
    if (parsed.userId !== userId) {
      throw new BadRequestException('Liveness session does not belong to user');
    }

    const confidence = this.estimateLivenessConfidence(frames, deviceSensors);
    const passed = confidence >= 0.85;
    await this.redisClient.del(this.livenessKey(sessionId));

    const verification = await this.recordVerification({
      userId,
      type: KycVerificationType.LIVENESS,
      provider: 'INTERNAL',
      reference: sessionId,
      matchScore: Math.round(confidence * 100),
      status: passed ? KycVerificationStatus.VERIFIED : KycVerificationStatus.FAILED,
      metadata: {
        challenges: parsed.challenges,
        frameCount: frames.length
      }
    });

    return {
      sessionId,
      passed,
      confidence,
      verificationId: verification.id,
      challengeResults: parsed.challenges.map((challenge) => ({
        type: challenge.type,
        passed,
        confidence
      }))
    };
  }

  async getTierStatus(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');

    const profile = this.limitsService.getProfile(user.limitTier);
    const dailySpentMinor = await this.spendingService.getUserDailyDebit(userId, Currency.NGN);
    const dailyLimitMinor = BigInt(profile.daily * 100);
    const verifications = await this.verificationRepo.find({
      where: { userId, status: KycVerificationStatus.VERIFIED }
    });

    const completed = new Set(verifications.map((item) => item.type));
    const nextTier = this.nextTier(user.limitTier);
    const missing = nextTier ? this.requirementsFor(nextTier).filter((item) => !completed.has(item)) : [];

    return {
      userId,
      currentTier: user.limitTier,
      dailyLimit: Number(dailyLimitMinor),
      maxBalance: profile.maxBalance === null ? null : profile.maxBalance * 100,
      dailySpent: Number(dailySpentMinor),
      remainingDaily: Number(dailyLimitMinor > dailySpentMinor ? dailyLimitMinor - dailySpentMinor : 0n),
      upgradeRequirements: nextTier
        ? {
            nextTier,
            missing,
            completed: this.requirementsFor(nextTier).filter((item) => completed.has(item))
          }
        : null
    };
  }

  async upgradeTier(userId: string, dto: TierUpgradeDto) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    if (!this.isForwardUpgrade(user.limitTier, dto.targetTier)) {
      throw new BadRequestException('Invalid tier progression');
    }

    const requiredTypes = this.requirementsFor(dto.targetTier);
    const verificationRows = dto.verificationIds.length
      ? await this.verificationRepo.find({ where: { id: In(dto.verificationIds) } })
      : [];
    const verifiedByType = new Set(
      verificationRows
        .filter(
          (item) => item.userId === userId && item.status === KycVerificationStatus.VERIFIED
        )
        .map((item) => item.type)
    );
    const missing = requiredTypes.filter((type) => !verifiedByType.has(type));
    if (missing.length > 0) {
      throw new BadRequestException(`Missing required verifications: ${missing.join(', ')}`);
    }

    await this.usersService.updateKycStatus(userId, {
      limitTier: dto.targetTier,
      kycStatus: KycStatus.VERIFIED,
      status: UserStatus.ACTIVE
    });

    const profile = this.limitsService.getProfile(dto.targetTier);
    return {
      previousTier: user.limitTier,
      newTier: dto.targetTier,
      dailyLimit: profile.daily * 100,
      maxBalance: profile.maxBalance === null ? null : profile.maxBalance * 100,
      upgradedAt: new Date().toISOString()
    };
  }

  async revalidateExistingIdentity(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) throw new NotFoundException('User not found');
    const kycData = await this.kycRepo.findOne({ where: { userId } });
    if (!kycData?.bvnEncrypted || !kycData?.ninEncrypted || !kycData?.dobEncrypted) {
      throw new BadRequestException('KYC profile missing for user');
    }
    const bvn = this.piiCrypto.decrypt(kycData.bvnEncrypted);
    const nin = this.piiCrypto.decrypt(kycData.ninEncrypted);
    const dateOfBirth = this.piiCrypto.decrypt(kycData.dobEncrypted);

    const result = await this.provider.verifyBvnAndNin({
      bvn,
      nin,
      firstName: user.firstName,
      lastName: user.lastName,
      dateOfBirth
    });
    if (!result.match) {
      throw new BadRequestException('KYC revalidation failed');
    }
    return { status: 'ok', reference: result.reference };
  }

  private async upsertKycData(
    userId: string,
    data: {
      bvn: string;
      nin: string;
      dateOfBirth: string;
      address?: string;
      selfieUrl?: string;
    }
  ) {
    const existing = await this.kycRepo.findOne({ where: { userId } });
    const encrypted = {
      bvnEncrypted: this.piiCrypto.encrypt(data.bvn),
      ninEncrypted: this.piiCrypto.encrypt(data.nin),
      dobEncrypted: this.piiCrypto.encrypt(data.dateOfBirth),
      addressEncrypted: data.address ? this.piiCrypto.encrypt(data.address) : null,
      bvnHash: this.piiCrypto.hash(data.bvn),
      ninHash: this.piiCrypto.hash(data.nin)
    };

    if (existing) {
      await this.kycRepo.update(
        { userId },
        {
          ...encrypted,
          selfieUrl: data.selfieUrl ?? existing.selfieUrl
        }
      );
      return;
    }
    await this.kycRepo.save(
      this.kycRepo.create({
        userId,
        ...encrypted,
        selfieUrl: data.selfieUrl ?? null
      })
    );
  }

  private async ensureIdentifierNotLinked(type: 'BVN' | 'NIN', hash: string, userId: string) {
    const existing = await this.kycRepo.findOne({
      where: type === 'BVN' ? { bvnHash: hash } : { ninHash: hash }
    });
    if (existing && existing.userId !== userId) {
      throw new ConflictException(`${type} is already linked to another account`);
    }
  }

  private async recordVerification(params: {
    userId: string;
    type: KycVerificationType;
    provider: string;
    reference: string;
    matchScore?: number;
    status: KycVerificationStatus;
    metadata?: Record<string, unknown>;
  }) {
    return this.verificationRepo.save(
      this.verificationRepo.create({
        userId: params.userId,
        type: params.type,
        provider: params.provider,
        referenceEncrypted: this.piiCrypto.encrypt(params.reference),
        matchScore: params.matchScore ?? null,
        status: params.status,
        verifiedAt: params.status === KycVerificationStatus.VERIFIED ? new Date() : null,
        metadata: params.metadata ?? null
      })
    );
  }

  private calculateMatchScore(
    request: { firstName: string; lastName: string; dateOfBirth?: string; phone?: string },
    providerMetadata: Record<string, unknown>
  ): number {
    let score = 0;
    const firstName = this.normalizeValue(providerMetadata.firstName ?? providerMetadata['first_name']);
    const lastName = this.normalizeValue(providerMetadata.lastName ?? providerMetadata['last_name']);
    const dob = this.normalizeDate(providerMetadata.dateOfBirth ?? providerMetadata['date_of_birth']);
    const phone = this.normalizePhone(providerMetadata.phoneNumber ?? providerMetadata['phone']);

    if (firstName && firstName === this.normalizeValue(request.firstName)) score += 25;
    if (lastName && lastName === this.normalizeValue(request.lastName)) score += 25;
    if (request.dateOfBirth && dob && dob === this.normalizeDate(request.dateOfBirth)) score += 25;
    if (request.phone && phone && phone === this.normalizePhone(request.phone)) score += 25;

    if (!firstName && !lastName && !dob && !phone) {
      return providerMetadata.stub ? 100 : 0;
    }
    return score;
  }

  private normalizeValue(value: unknown): string {
    return typeof value === 'string' ? value.trim().toLowerCase() : '';
  }

  private normalizeDate(value: unknown): string {
    if (typeof value !== 'string') return '';
    const isoDate = new Date(value);
    if (Number.isNaN(isoDate.getTime())) return '';
    return isoDate.toISOString().slice(0, 10);
  }

  private normalizePhone(value: unknown): string {
    if (typeof value !== 'string') return '';
    const digits = value.replace(/\D/g, '');
    if (digits.startsWith('234') && digits.length === 13) return digits.slice(3);
    if (digits.startsWith('0') && digits.length === 11) return digits.slice(1);
    return digits;
  }

  private async evaluateFaceComparison(
    userId: string,
    selfieUrl: string | undefined,
    bvnMetadata: Record<string, unknown>,
    ninMetadata: Record<string, unknown>
  ): Promise<{
    decision: KycDecision;
    reason?: string;
    reference?: string;
    details: Record<string, unknown>;
  }> {
    if (!selfieUrl || !this.isHttpUrl(selfieUrl)) {
      return {
        decision: 'APPROVE',
        reason: 'SELFIE_NOT_PROVIDED',
        details: { status: 'skipped', reason: 'SELFIE_NOT_PROVIDED' }
      };
    }

    if (!this.provider.compareFace) {
      return {
        decision: 'APPROVE',
        reason: 'FACE_PROVIDER_UNAVAILABLE',
        details: { status: 'skipped', reason: 'FACE_PROVIDER_UNAVAILABLE' }
      };
    }

    const officialImage =
      this.extractFaceImage(ninMetadata) ||
      this.extractFaceImage(bvnMetadata);

    if (!officialImage) {
      return {
        decision: 'APPROVE',
        reason: 'OFFICIAL_FACE_IMAGE_NOT_AVAILABLE',
        details: { status: 'skipped', reason: 'OFFICIAL_FACE_IMAGE_NOT_AVAILABLE' }
      };
    }

    if (!this.isHttpUrl(officialImage)) {
      return {
        decision: 'APPROVE',
        reason: 'OFFICIAL_IMAGE_UNSUPPORTED_FORMAT',
        details: { status: 'skipped', reason: 'OFFICIAL_IMAGE_UNSUPPORTED_FORMAT' }
      };
    }

    const compared = await this.provider.compareFace({
      image1: selfieUrl,
      image2: officialImage
    });
    const matchScore = Math.round(compared.confidence);
    const verification = await this.recordVerification({
      userId,
      type: KycVerificationType.GOVERNMENT_ID,
      provider: this.provider.name,
      reference: compared.reference,
      matchScore,
      status: compared.match ? KycVerificationStatus.VERIFIED : KycVerificationStatus.FAILED,
      metadata: compared.metadata
    });

    if (!compared.match) {
      return {
        decision: 'MANUAL_REVIEW',
        reason: 'FACE_MISMATCH',
        reference: compared.reference,
        details: {
          status: 'manual_review',
          reason: 'FACE_MISMATCH',
          confidence: compared.confidence,
          threshold: compared.threshold,
          verificationId: verification.id
        }
      };
    }

    return {
      decision: 'APPROVE',
      reference: compared.reference,
      details: {
        status: 'verified',
        confidence: compared.confidence,
        threshold: compared.threshold,
        verificationId: verification.id
      }
    };
  }

  private extractFaceImage(metadata: Record<string, unknown>): string | null {
    const candidates: unknown[] = [
      metadata.image,
      metadata.selfieUrl,
      metadata.photoUrl,
      metadata.photo
    ];
    for (const candidate of candidates) {
      if (typeof candidate === 'string' && candidate.trim().length > 0) {
        return candidate.trim();
      }
    }
    return null;
  }

  private isHttpUrl(value: string): boolean {
    try {
      const parsed = new URL(value);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private livenessKey(sessionId: string) {
    return `kyc:liveness:${sessionId}`;
  }

  private randomChallenges() {
    const available = ['SMILE', 'BLINK', 'TURN_LEFT', 'TURN_RIGHT', 'NOD'];
    const picked: Array<{ type: string; durationMs: number }> = [];
    while (picked.length < 3) {
      const next = available[Math.floor(Math.random() * available.length)];
      if (!picked.find((item) => item.type === next)) {
        picked.push({ type: next, durationMs: next === 'BLINK' ? 2000 : 3000 });
      }
    }
    return picked;
  }

  private estimateLivenessConfidence(frames: string[], deviceSensors: Record<string, unknown>): number {
    const frameFactor = Math.min(frames.length / 10, 1);
    const sensorFactor = Object.keys(deviceSensors).length > 0 ? 1 : 0.8;
    return Number(Math.min(0.99, 0.75 + frameFactor * 0.2 + (sensorFactor - 0.8) * 0.2).toFixed(2));
  }

  private nextTier(current: LimitTier): LimitTier | null {
    if (current === LimitTier.TIER0) return LimitTier.TIER1;
    if (current === LimitTier.TIER1) return LimitTier.TIER2;
    if (current === LimitTier.TIER2) return LimitTier.TIER3;
    return null;
  }

  private requirementsFor(tier: LimitTier): KycVerificationType[] {
    if (tier === LimitTier.TIER1) return [KycVerificationType.BVN, KycVerificationType.NIN];
    if (tier === LimitTier.TIER2) return [KycVerificationType.GOVERNMENT_ID];
    if (tier === LimitTier.TIER3) {
      return [KycVerificationType.GOVERNMENT_ID, KycVerificationType.ADDRESS, KycVerificationType.LIVENESS];
    }
    return [];
  }

  private isForwardUpgrade(current: LimitTier, target: LimitTier): boolean {
    const order = [LimitTier.TIER0, LimitTier.TIER1, LimitTier.TIER2, LimitTier.TIER3];
    return order.indexOf(target) > order.indexOf(current);
  }
}
