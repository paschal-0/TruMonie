import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { REDIS_CLIENT } from '../redis/redis.module';
import { OtpProvider } from './interfaces/otp-provider.interface';
import { OTP_PROVIDERS } from './otp.constants';

export type OtpChannel = 'sms' | 'email';

interface OtpState {
  code: string;
  purpose: string;
  attempts: number;
  maxAttempts: number;
  createdAt: string;
  resendAvailableAt: string;
}

@Injectable()
export class OtpService {
  private readonly otpTtlSeconds = 300;
  private readonly resendCooldownSeconds = 60;
  private readonly maxAttempts = 3;
  private readonly lockoutSeconds = 30 * 60;
  private readonly providers: Record<string, OtpProvider>;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: {
      setex: (key: string, ttl: number, value: string) => Promise<void>;
      get: (key: string) => Promise<string | null>;
      set: (key: string, value: string, mode?: string, duration?: number) => Promise<'OK' | null>;
      ttl: (key: string) => Promise<number>;
      del: (key: string) => Promise<number>;
    },
    private readonly configService: ConfigService,
    @Inject(OTP_PROVIDERS) providers: OtpProvider[]
  ) {
    this.providers = providers.reduce<Record<string, OtpProvider>>((acc, provider) => {
      acc[provider.name] = provider;
      return acc;
    }, {});
  }

  async sendOtp(
    to: string,
    channel: OtpChannel,
    purpose: string
  ): Promise<{ message: string; expiresIn: number; resendAfter: number }> {
    await this.assertNotLocked(purpose, to);
    const key = this.key(purpose, to);
    const existing = await this.redisClient.get(key);
    if (existing) {
      const parsed = this.safeParse(existing);
      if (parsed?.resendAvailableAt) {
        const waitSeconds = Math.ceil(
          (new Date(parsed.resendAvailableAt).getTime() - Date.now()) / 1000
        );
        if (waitSeconds > 0) {
          throw new BadRequestException(`OTP resend available in ${waitSeconds}s`);
        }
      }
    }

    const code = this.generateCode();
    const now = new Date();
    const payload: OtpState = {
      code,
      purpose,
      attempts: 0,
      maxAttempts: this.maxAttempts,
      createdAt: now.toISOString(),
      resendAvailableAt: new Date(now.getTime() + this.resendCooldownSeconds * 1000).toISOString()
    };
    await this.redisClient.setex(key, this.otpTtlSeconds, JSON.stringify(payload));
    const provider = this.resolveProvider();
    if (provider.supportsChannel && !provider.supportsChannel(channel)) {
      throw new BadRequestException(`OTP provider ${provider.name} does not support channel ${channel}`);
    }
    await provider.sendOtp({ to, channel, purpose, code });
    return {
      message: 'OTP sent',
      expiresIn: this.otpTtlSeconds,
      resendAfter: this.resendCooldownSeconds
    };
  }

  async verifyOtp(
    to: string,
    purpose: string,
    code: string
  ): Promise<{ verified: boolean; remainingAttempts?: number; lockedFor?: number }> {
    await this.assertNotLocked(purpose, to);
    const key = this.key(purpose, to);
    const stored = await this.redisClient.get(key);
    const parsed = this.safeParse(stored);
    if (!parsed) {
      return { verified: false };
    }

    if (parsed.code === code) {
      await this.redisClient.del(key);
      return { verified: true };
    }

    const attempts = parsed.attempts + 1;
    const remainingAttempts = Math.max(parsed.maxAttempts - attempts, 0);
    if (attempts >= parsed.maxAttempts) {
      await this.redisClient.set(
        this.lockKey(purpose, to),
        '1',
        'EX',
        this.lockoutSeconds
      );
      await this.redisClient.del(key);
      return { verified: false, remainingAttempts: 0, lockedFor: this.lockoutSeconds };
    }

    const ttl = await this.redisClient.ttl(key);
    const updated: OtpState = { ...parsed, attempts };
    await this.redisClient.setex(key, Math.max(ttl, 1), JSON.stringify(updated));
    return { verified: false, remainingAttempts };
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private key(purpose: string, to: string) {
    return `otp:${purpose}:${to}`;
  }

  private lockKey(purpose: string, to: string) {
    return `otp:lock:${purpose}:${to}`;
  }

  private safeParse(value: string | null): OtpState | null {
    if (!value) return null;
    try {
      const parsed = JSON.parse(value) as OtpState;
      return parsed?.code ? parsed : null;
    } catch {
      // backward compatibility if old raw code string still exists
      return {
        code: value,
        purpose: '',
        attempts: 0,
        maxAttempts: this.maxAttempts,
        createdAt: new Date().toISOString(),
        resendAvailableAt: new Date().toISOString()
      };
    }
  }

  private async assertNotLocked(purpose: string, to: string) {
    const key = this.lockKey(purpose, to);
    const lock = await this.redisClient.get(key);
    if (!lock) return;
    const ttl = await this.redisClient.ttl(key);
    throw new BadRequestException(`OTP is locked. Retry in ${Math.max(ttl, 0)}s`);
  }

  private resolveProvider(): OtpProvider {
    const configured = this.configService.get<string>('integrations.defaultOtpProvider', 'licensed');
    const provider = this.providers[configured];
    if (!provider) {
      const supported = Object.keys(this.providers).join(', ');
      throw new BadRequestException(
        `Unsupported OTP provider "${configured}". Supported providers: ${supported}`
      );
    }
    return provider;
  }
}
