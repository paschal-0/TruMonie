import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';
import { UsersModule } from '../users/users.module';
import { OtpService } from './otp.service';
import { RefreshTokensService } from './refresh-tokens.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { OnboardingEvent } from './entities/onboarding-event.entity';
import { InternalOtpProvider } from './providers/internal-otp.provider';
import { LicensedOtpProvider } from './providers/licensed-otp.provider';
import { OTP_PROVIDERS } from './otp.constants';
import { OnboardingEventsService } from './onboarding-events.service';
import { RiskModule } from '../risk/risk.module';
import { KycModule } from '../kyc/kyc.module';

@Module({
  imports: [
    UsersModule,
    RiskModule,
    KycModule,
    TypeOrmModule.forFeature([RefreshToken, OnboardingEvent]),
    PassportModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
        signOptions: { expiresIn: configService.get<string>('jwt.expiresIn') }
      })
    })
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    JwtStrategy,
    OtpService,
    OnboardingEventsService,
    RefreshTokensService,
    InternalOtpProvider,
    LicensedOtpProvider,
    {
      provide: OTP_PROVIDERS,
      useFactory: (internalProvider: InternalOtpProvider, licensedProvider: LicensedOtpProvider) => [
        internalProvider,
        licensedProvider
      ],
      inject: [InternalOtpProvider, LicensedOtpProvider]
    }
  ],
  exports: [AuthService]
})
export class AuthModule {}
