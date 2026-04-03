import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UseGuards
} from '@nestjs/common';

import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { AdminLoginDto } from './dto/admin-login.dto';
import { AuthService } from './auth.service';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserRole } from '../users/entities/user.entity';
import { OtpService } from './otp.service';
import { VerifyOtpDto } from './dto/verify-otp.dto';
import { SendOtpDto } from './dto/send-otp.dto';
import { BindDeviceDto } from './dto/bind-device.dto';
import { TransferDeviceDto } from './dto/transfer-device.dto';
import { DeviceBindingsService } from '../risk/device-bindings.service';
import { KycService } from '../kyc/kyc.service';
import { OnboardingEventsService } from './onboarding-events.service';
import { UsersService } from '../users/users.service';
import { SetLoginPasswordDto } from './dto/set-login-password.dto';
import { BiometricChallengeService } from './biometric-challenge.service';
import { CreateBiometricChallengeDto } from './dto/create-biometric-challenge.dto';
import { VerifyBiometricChallengeDto } from './dto/verify-biometric-challenge.dto';
import { StepUpAuthService } from './step-up-auth.service';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly otpService: OtpService,
    private readonly deviceBindingsService: DeviceBindingsService,
    private readonly kycService: KycService,
    private readonly onboardingEventsService: OnboardingEventsService,
    private readonly usersService: UsersService,
    private readonly biometricChallengeService: BiometricChallengeService,
    private readonly stepUpAuthService: StepUpAuthService
  ) {}

  @Post('register')
  async register(@Body() dto: RegisterDto) {
    const result = await this.authService.register(dto);
    await this.onboardingEventsService.publish(result.user.id, 'USER_REGISTERED', {
      accountNumberSource: dto.usePhoneAsAccountNumber ? 'PHONE' : 'SYSTEM'
    });
    return result;
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('admin/login')
  loginAdmin(@Body() dto: AdminLoginDto) {
    return this.authService.loginAdmin({
      identifier: dto.identifier,
      password: dto.password,
      mfaCode: dto.mfa_code
    });
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshTokenDto) {
    return this.authService.refresh(dto);
  }

  @Post('otp/send')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.otpService.sendOtp(
      this.resolveDestination(dto.destination, dto.phone),
      dto.channel ?? 'sms',
      dto.purpose
    );
  }

  @Post('otp/verify')
  async verifyOtp(@Body() dto: VerifyOtpDto) {
    const destination = this.resolveDestination(dto.destination, dto.phone);
    const result = await this.otpService.verifyOtp(destination, dto.purpose, dto.code);
    if (!result.verified) {
      return result;
    }

    if (dto.purpose.toUpperCase() === 'LOGIN') {
      const login = await this.authService.loginWithOtp(destination);
      await this.onboardingEventsService.publish(login.user.id, 'OTP_VERIFIED', {
        purpose: dto.purpose,
        destination
      });
      return {
        verified: true,
        accessToken: login.tokens.accessToken,
        refreshToken: login.tokens.refreshToken,
        tokenType: login.tokens.tokenType,
        expiresIn: 3600
      };
    }
    return { verified: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('biometric/challenge')
  createBiometricChallenge(@CurrentUser() user: User, @Body() dto: CreateBiometricChallengeDto) {
    return this.biometricChallengeService.createChallenge(user.id, dto.type);
  }

  @UseGuards(JwtAuthGuard)
  @Post('biometric/verify')
  verifyBiometricChallenge(@CurrentUser() user: User, @Body() dto: VerifyBiometricChallengeDto) {
    return this.biometricChallengeService.verifyChallenge(
      user.id,
      dto.challenge_id,
      dto.signed_attestation
    );
  }

  @UseGuards(JwtAuthGuard)
  @Post('device/bind')
  async bindDevice(@CurrentUser() user: User, @Body() dto: BindDeviceDto) {
    const response = await this.deviceBindingsService.bindDevice(user.id, dto.deviceFingerprint, user.id);
    await this.onboardingEventsService.publish(user.id, 'DEVICE_BOUND', {
      bindingId: response.bindingId,
      platform: dto.deviceFingerprint.platform
    });
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Post('device/transfer')
  async transferDevice(@CurrentUser() user: User, @Body() dto: TransferDeviceDto) {
    await this.stepUpAuthService.assertDeviceTransferStepUp(
      user,
      dto.otp,
      dto.biometric_ticket,
      dto.otp_destination
    );
    await this.kycService.revalidateExistingIdentity(user.id);
    const response = await this.deviceBindingsService.transferDevice(
      user.id,
      dto.newDeviceFingerprint,
      user.id
    );
    await this.onboardingEventsService.publish(user.id, 'DEVICE_TRANSFERRED', {
      oldBindingId: response.oldBindingId,
      newBindingId: response.newBindingId
    });
    return response;
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  me(@CurrentUser() user: User) {
    return this.authService.me(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @Post('password/set')
  setPassword(@CurrentUser() user: User, @Body() dto: SetLoginPasswordDto) {
    return this.usersService.setLoginPassword(user.id, dto.password, dto.currentPassword);
  }

  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(
    UserRole.ADMIN,
    UserRole.SUPER_ADMIN,
    UserRole.COMPLIANCE_OFFICER,
    UserRole.OPERATIONS_MANAGER,
    UserRole.FINANCE_OFFICER,
    UserRole.CUSTOMER_SUPPORT,
    UserRole.AUDITOR
  )
  @Post('admin/revoke-sessions')
  revokeOwnAdminSessions(@CurrentUser() user: User) {
    return this.authService.revokeAllSessions(user.id);
  }

  private resolveDestination(destination?: string, phone?: string): string {
    const value = destination ?? phone;
    if (!value) {
      throw new BadRequestException('destination (or phone) is required');
    }
    const trimmed = value.trim();
    return trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
  }
}
