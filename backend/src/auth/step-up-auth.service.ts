import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SecurityErrorCode, SecurityException } from '../security/security.errors';
import { User } from '../users/entities/user.entity';
import { BiometricChallengeService } from './biometric-challenge.service';
import { OtpService } from './otp.service';

type StepUpFactor = 'OTP' | 'BIOMETRIC';

@Injectable()
export class StepUpAuthService {
  private readonly transferOtpThresholdMinor: bigint;
  private readonly transferBiometricThresholdMinor: bigint;
  private readonly transferPurpose: string;
  private readonly deviceTransferPurpose: string;

  constructor(
    private readonly otpService: OtpService,
    private readonly biometricChallengeService: BiometricChallengeService,
    configService: ConfigService
  ) {
    this.transferOtpThresholdMinor = BigInt(
      configService.get<string>('security.transferOtpThresholdMinor', '5000000')
    );
    this.transferBiometricThresholdMinor = BigInt(
      configService.get<string>('security.transferBiometricThresholdMinor', '50000000')
    );
    this.transferPurpose = configService.get<string>('security.transferOtpPurpose', 'TRANSFER_MFA');
    this.deviceTransferPurpose = configService.get<string>(
      'security.deviceTransferOtpPurpose',
      'DEVICE_TRANSFER'
    );
  }

  async assertTransferStepUp(
    user: Pick<User, 'id' | 'email'>,
    amountMinor: string,
    params: {
      otpCode?: string;
      otpDestination?: string;
      biometricTicket?: string;
    }
  ) {
    const amount = BigInt(amountMinor);
    const required: StepUpFactor[] = [];
    if (amount >= this.transferOtpThresholdMinor) required.push('OTP');
    if (amount >= this.transferBiometricThresholdMinor) required.push('BIOMETRIC');
    if (!required.length) return;

    const otpDestination = this.resolveOtpDestination(user.email, params.otpDestination);

    if (required.includes('OTP')) {
      if (!params.otpCode) {
        this.throwMfaRequired(required, otpDestination, undefined, this.transferPurpose);
      }
      const result = await this.otpService.verifyOtp(otpDestination, this.transferPurpose, params.otpCode!);
      if (!result.verified) {
        this.throwMfaRequired(required, otpDestination, result, this.transferPurpose);
      }
    }

    if (required.includes('BIOMETRIC')) {
      if (!params.biometricTicket) {
        this.throwMfaRequired(required, otpDestination, undefined, this.transferPurpose);
      }
      await this.biometricChallengeService.consumeTicket(user.id, params.biometricTicket!);
    }
  }

  async assertDeviceTransferStepUp(
    user: Pick<User, 'id' | 'phoneNumber' | 'email'>,
    otpCode: string,
    biometricTicket: string,
    otpDestination?: string
  ) {
    const destination = this.resolveOtpDestination(user.email || user.phoneNumber, otpDestination);
    const result = await this.otpService.verifyOtp(destination, this.deviceTransferPurpose, otpCode);
    if (!result.verified) {
      this.throwMfaRequired(['OTP', 'BIOMETRIC'], destination, result, this.deviceTransferPurpose);
    }
    await this.biometricChallengeService.consumeTicket(user.id, biometricTicket);
  }

  private resolveOtpDestination(defaultDestination: string, requestedDestination?: string) {
    return (requestedDestination?.trim() || defaultDestination || '').trim().toLowerCase();
  }

  private throwMfaRequired(
    requiredFactors: StepUpFactor[],
    otpDestination: string,
    otpResult?: { verified: boolean; remainingAttempts?: number; lockedFor?: number },
    otpPurpose = this.transferPurpose
  ): never {
    throw new SecurityException(
      SecurityErrorCode.MFA_REQUIRED,
      'MFA required for this transaction',
      HttpStatus.BAD_REQUEST,
      {
        required_factors: requiredFactors,
        otp_purpose: otpPurpose,
        otp_destination: otpDestination,
        otp: otpResult ?? null
      }
    );
  }
}
