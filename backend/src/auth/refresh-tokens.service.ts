import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import * as argon2 from 'argon2';
import { Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { RefreshToken } from './entities/refresh-token.entity';

@Injectable()
export class RefreshTokensService {
  constructor(
    @InjectRepository(RefreshToken)
    private readonly refreshRepo: Repository<RefreshToken>
  ) {}

  async generate(
    userId: string,
    token: string,
    expiresAt: Date,
    jti?: string,
    metadata?: Record<string, unknown>
  ) {
    const tokenJti = jti ?? uuidv4();
    const tokenHash = await argon2.hash(token);
    const record = this.refreshRepo.create({
      userId,
      jti: tokenJti,
      tokenHash,
      expiresAt,
      metadata: metadata ?? null
    });
    await this.refreshRepo.save(record);
    return tokenJti;
  }

  async revoke(jti: string) {
    await this.refreshRepo.update({ jti }, { revoked: true });
  }

  async revokeUserTokens(userId: string) {
    await this.refreshRepo.update({ userId }, { revoked: true });
  }

  async validate(userId: string, jti: string, token: string) {
    const record = await this.refreshRepo.findOne({ where: { jti, userId } });
    if (!record || record.revoked || record.expiresAt < new Date()) {
      throw new UnauthorizedException('Refresh token expired or revoked');
    }
    const valid = await argon2.verify(record.tokenHash, token);
    if (!valid) {
      throw new UnauthorizedException('Refresh token invalid');
    }
    return record;
  }
}
