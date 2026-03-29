import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { REDIS_CLIENT } from '../redis/redis.module';
import { OtpProvider } from './interfaces/otp-provider.interface';
import { OTP_PROVIDERS } from './otp.constants';

export type OtpChannel = 'sms' | 'email';

@Injectable()
export class OtpService {
  private readonly providers: Record<string, OtpProvider>;

  constructor(
    @Inject(REDIS_CLIENT)
    private readonly redisClient: { setex: (key: string, ttl: number, value: string) => Promise<void>; get: (key: string) => Promise<string | null>; del: (key: string) => Promise<number> }
    ,
    private readonly configService: ConfigService,
    @Inject(OTP_PROVIDERS) providers: OtpProvider[]
  ) {
    this.providers = providers.reduce<Record<string, OtpProvider>>((acc, provider) => {
      acc[provider.name] = provider;
      return acc;
    }, {});
  }

  async sendOtp(to: string, channel: OtpChannel, purpose: string): Promise<{ success: boolean }> {
    const code = this.generateCode();
    const key = this.key(purpose, to);
    await this.redisClient.setex(key, 300, code); // 5 minutes
    const provider = this.resolveProvider();
    if (provider.supportsChannel && !provider.supportsChannel(channel)) {
      throw new BadRequestException(`OTP provider ${provider.name} does not support channel ${channel}`);
    }
    await provider.sendOtp({ to, channel, purpose, code });
    return { success: true };
  }

  async verifyOtp(to: string, purpose: string, code: string): Promise<boolean> {
    const key = this.key(purpose, to);
    const stored = await this.redisClient.get(key);
    if (stored && stored === code) {
      await this.redisClient.del(key);
      return true;
    }
    return false;
  }

  private generateCode(): string {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  private key(purpose: string, to: string) {
    return `otp:${purpose}:${to}`;
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
