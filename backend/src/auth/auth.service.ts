import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsService } from '../ledger/accounts.service';
import { UsersService } from '../users/users.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { RefreshTokensService } from './refresh-tokens.service';
import { addSeconds } from '../utils/time';
import { AdminUser } from '../platform-admin/entities/admin-user.entity';
import { UserRole } from '../users/entities/user.entity';
import { OtpService } from './otp.service';

const ADMIN_ROLES = new Set<UserRole>([
  UserRole.ADMIN,
  UserRole.SUPER_ADMIN,
  UserRole.COMPLIANCE_OFFICER,
  UserRole.OPERATIONS_MANAGER,
  UserRole.FINANCE_OFFICER,
  UserRole.CUSTOMER_SUPPORT,
  UserRole.AUDITOR
]);

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly refreshTokensService: RefreshTokensService,
    private readonly otpService: OtpService,
    @InjectRepository(AdminUser)
    private readonly adminUserRepo: Repository<AdminUser>
  ) {}

  async register(dto: RegisterDto) {
    const user = await this.usersService.create(dto);
    await this.accountsService.ensureUserBaseAccounts(user.id, {
      accountNumberSource: user.accountNumberSource === 'PHONE' ? 'PHONE' : 'SYSTEM',
      phoneNumber: user.phoneNumber
    });
    return {
      user: this.sanitizeUser(user),
      tokens: await this.signTokens(user)
    };
  }

  async login(dto: LoginDto) {
    const user = await this.usersService.findByEmailOrPhoneWithSecret(dto.identifier);
    if (!user || !(await this.usersService.verifySecret(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.usersService.updateLastLogin(user.id);
    return {
      user: this.sanitizeUser(user),
      tokens: await this.signTokens(user)
    };
  }

  async loginAdmin(dto: { identifier: string; password: string; mfaCode?: string }) {
    const user = await this.usersService.findByEmailOrPhoneWithSecret(dto.identifier);
    if (!user || !(await this.usersService.verifySecret(user.passwordHash, dto.password))) {
      throw new UnauthorizedException('Invalid credentials');
    }
    if (!ADMIN_ROLES.has(user.role)) {
      throw new UnauthorizedException('Admin role required');
    }

    const adminProfile = await this.adminUserRepo.findOne({ where: { userId: user.id } });
    if (adminProfile && !adminProfile.isActive) {
      throw new UnauthorizedException('Admin account is inactive');
    }

    const mfaEnabled = adminProfile?.mfaEnabled ?? true;
    const enforceMfa = this.configService.get<boolean>('platformAdmin.enforceMfa', false);
    if (enforceMfa && mfaEnabled) {
      if (!dto.mfaCode) {
        await this.otpService.sendOtp(user.email.toLowerCase(), 'email', 'ADMIN_LOGIN');
        return {
          mfa_required: true,
          destination: this.maskEmail(user.email),
          message: 'MFA OTP sent to admin email'
        };
      }
      const verify = await this.otpService.verifyOtp(user.email.toLowerCase(), 'ADMIN_LOGIN', dto.mfaCode);
      if (!verify.verified) {
        throw new UnauthorizedException('Invalid or expired MFA code');
      }
    }

    await this.usersService.updateLastLogin(user.id);
    if (adminProfile) {
      adminProfile.lastLoginAt = new Date();
      await this.adminUserRepo.save(adminProfile);
    }
    return {
      mfa_required: false,
      user: this.sanitizeUser(user),
      tokens: await this.signTokens(user)
    };
  }

  async loginWithOtp(identifier: string) {
    const user = await this.usersService.findByIdentifier(identifier);
    if (!user) {
      throw new UnauthorizedException('User not found for OTP login');
    }
    await this.usersService.updateLastLogin(user.id);
    return {
      user: this.sanitizeUser(user),
      tokens: await this.signTokens(user)
    };
  }

  async me(userId: string) {
    const user = await this.usersService.findById(userId);
    if (!user) {
      throw new UnauthorizedException();
    }
    return this.sanitizeUser(user);
  }

  async refresh(dto: RefreshTokenDto) {
    try {
      const payload = await this.jwtService.verifyAsync<JwtPayload>(dto.refreshToken, {
        secret: this.configService.get<string>('jwt.refreshSecret')
      });
      const user = await this.usersService.findById(payload.sub);
      if (!user) {
        throw new UnauthorizedException();
      }
      await this.refreshTokensService.validate(user.id, payload.jti ?? '', dto.refreshToken);
      if (payload.jti) {
        await this.refreshTokensService.revoke(payload.jti);
      }
      return {
        user: this.sanitizeUser(user),
        tokens: await this.signTokens(user)
      };
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  async revokeAllSessions(userId: string) {
    await this.refreshTokensService.revokeUserTokens(userId);
    return { revoked: true };
  }

  private async signTokens(user: { id: string; email: string; phoneNumber: string }) {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      phoneNumber: user.phoneNumber
    };
    const accessExpiresIn = this.normalizeJwtExpiry(this.configService.get<string>('jwt.expiresIn'));
    const accessToken = await this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('jwt.secret'),
      expiresIn: accessExpiresIn
    });
    const refreshJti = randomUUID();
    const refreshExpiresIn = this.normalizeJwtExpiry(
      this.configService.get<string>('jwt.refreshExpiresIn') ?? '7d'
    );
    const refreshPayload: JwtPayload = { ...payload, jti: refreshJti };
    const refreshToken = await this.jwtService.signAsync(refreshPayload, {
      secret: this.configService.get<string>('jwt.refreshSecret'),
      expiresIn: refreshExpiresIn
    });
    const refreshExpiresDate = addSeconds(new Date(), this.secondsFrom(refreshExpiresIn));
    await this.refreshTokensService.generate(user.id, refreshToken, refreshExpiresDate, refreshJti);

    return { accessToken, refreshToken, tokenType: 'Bearer' };
  }

  private sanitizeUser<T extends object>(user: T): Omit<T, 'passwordHash' | 'pinHash'> {
    const sanitized = { ...user } as Record<string, unknown>;
    delete sanitized.passwordHash;
    delete sanitized.pinHash;
    return sanitized as Omit<T, 'passwordHash' | 'pinHash'>;
  }

  private secondsFrom(interval: string | number): number {
    if (typeof interval === 'number') return interval;
    if (interval.endsWith('d')) return parseInt(interval, 10) * 86400;
    if (interval.endsWith('h')) return parseInt(interval, 10) * 3600;
    if (interval.endsWith('m')) return parseInt(interval, 10) * 60;
    return parseInt(interval, 10);
  }

  private normalizeJwtExpiry(interval?: string | number): string | number {
    if (interval === undefined || interval === null) return 3600;
    if (typeof interval === 'number') return interval;
    const trimmed = interval.trim();
    if (/^\d+$/.test(trimmed)) {
      return Number.parseInt(trimmed, 10);
    }
    return trimmed;
  }

  private maskEmail(email: string) {
    const [name, domain] = email.split('@');
    if (!name || !domain) return email;
    if (name.length <= 2) return `${name[0]}***@${domain}`;
    return `${name.slice(0, 2)}***@${domain}`;
  }
}
