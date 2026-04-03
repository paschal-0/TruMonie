import { BadRequestException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';

import { REDIS_CLIENT } from '../redis/redis.module';
import { SecurityErrorCode, SecurityException } from '../security/security.errors';
import { BiometricType } from './dto/create-biometric-challenge.dto';

interface RedisClient {
  setex: (key: string, ttl: number, value: string) => Promise<void>;
  get: (key: string) => Promise<string | null>;
  del: (key: string) => Promise<number>;
}

interface StoredBiometricChallenge {
  challengeId: string;
  userId: string;
  type: BiometricType;
  expiresAt: string;
}

@Injectable()
export class BiometricChallengeService {
  private readonly challengeTtlSeconds: number;
  private readonly ticketTtlSeconds: number;

  constructor(
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClient,
    private readonly configService: ConfigService
  ) {
    this.challengeTtlSeconds = this.configService.get<number>(
      'security.biometricChallengeTtlSeconds',
      60
    );
    this.ticketTtlSeconds = this.configService.get<number>('security.biometricTicketTtlSeconds', 120);
  }

  async createChallenge(userId: string, type: BiometricType = BiometricType.FINGERPRINT) {
    const challengeId = randomUUID();
    const expiresAt = new Date(Date.now() + this.challengeTtlSeconds * 1000).toISOString();
    const payload: StoredBiometricChallenge = { challengeId, userId, type, expiresAt };
    await this.redisClient.setex(this.challengeKey(challengeId), this.challengeTtlSeconds, JSON.stringify(payload));
    return {
      challenge_id: challengeId,
      type,
      expires_at: expiresAt
    };
  }

  async verifyChallenge(userId: string, challengeId: string, signedAttestation: string) {
    if (!signedAttestation.trim()) {
      throw new SecurityException(
        SecurityErrorCode.BIOMETRIC_VERIFICATION_FAILED,
        'Biometric attestation is required',
        HttpStatus.FORBIDDEN
      );
    }
    const raw = await this.redisClient.get(this.challengeKey(challengeId));
    if (!raw) {
      throw new SecurityException(
        SecurityErrorCode.BIOMETRIC_VERIFICATION_FAILED,
        'Biometric challenge expired or not found',
        HttpStatus.FORBIDDEN
      );
    }
    const parsed = this.safeParse(raw);
    if (!parsed) {
      throw new BadRequestException('Invalid biometric challenge payload');
    }
    if (parsed.userId !== userId) {
      throw new SecurityException(
        SecurityErrorCode.BIOMETRIC_VERIFICATION_FAILED,
        'Biometric challenge does not belong to user',
        HttpStatus.FORBIDDEN
      );
    }

    await this.redisClient.del(this.challengeKey(challengeId));

    const ticketId = randomUUID();
    const ticketKey = this.ticketKey(userId, ticketId);
    await this.redisClient.setex(ticketKey, this.ticketTtlSeconds, '1');

    return {
      verified: true,
      ticket_id: ticketId,
      expires_at: new Date(Date.now() + this.ticketTtlSeconds * 1000).toISOString()
    };
  }

  async consumeTicket(userId: string, ticketId: string) {
    const key = this.ticketKey(userId, ticketId);
    const exists = await this.redisClient.get(key);
    if (!exists) {
      throw new SecurityException(
        SecurityErrorCode.BIOMETRIC_VERIFICATION_FAILED,
        'Biometric verification failed or expired',
        HttpStatus.FORBIDDEN
      );
    }
    await this.redisClient.del(key);
    return { valid: true };
  }

  private challengeKey(challengeId: string) {
    return `bio:challenge:${challengeId}`;
  }

  private ticketKey(userId: string, ticketId: string) {
    return `bio:ticket:${userId}:${ticketId}`;
  }

  private safeParse(raw: string): StoredBiometricChallenge | null {
    try {
      const parsed = JSON.parse(raw) as StoredBiometricChallenge;
      if (!parsed?.challengeId || !parsed?.userId) return null;
      return parsed;
    } catch {
      return null;
    }
  }
}
