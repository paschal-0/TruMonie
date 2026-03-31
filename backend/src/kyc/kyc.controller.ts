import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { ValidateBvnDto } from './dto/validate-bvn.dto';
import { ValidateNinDto } from './dto/validate-nin.dto';
import { LivenessStartDto } from './dto/liveness-start.dto';
import { LivenessSubmitDto } from './dto/liveness-submit.dto';
import { TierUpgradeDto } from './dto/tier-upgrade.dto';
import { VerifyGovernmentIdDto } from './dto/verify-government-id.dto';
import { VerifyAddressDto } from './dto/verify-address.dto';
import { KycService } from './kyc.service';

@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('verify')
  verify(@CurrentUser() user: User, @Body() dto: VerifyKycDto) {
    return this.kycService.verify(user.id, dto);
  }

  @Post('bvn/validate')
  validateBvn(@CurrentUser() user: User, @Body() dto: ValidateBvnDto) {
    return this.kycService.validateBvn(user.id, {
      ...dto,
      firstName: dto.firstName ?? user.firstName,
      lastName: dto.lastName ?? user.lastName,
      phone: dto.phone ?? user.phoneNumber
    });
  }

  @Post('nin/validate')
  validateNin(@CurrentUser() user: User, @Body() dto: ValidateNinDto) {
    return this.kycService.validateNin(user.id, {
      ...dto,
      firstName: dto.firstName ?? user.firstName,
      lastName: dto.lastName ?? user.lastName
    });
  }

  @Post('government-id/verify')
  verifyGovernmentId(@CurrentUser() user: User, @Body() dto: VerifyGovernmentIdDto) {
    return this.kycService.verifyGovernmentId(user.id, dto);
  }

  @Post('address/verify')
  verifyAddress(@CurrentUser() user: User, @Body() dto: VerifyAddressDto) {
    return this.kycService.verifyAddress(user.id, dto);
  }

  @Post('liveness/start')
  livenessStart(@CurrentUser() user: User, @Body() dto: LivenessStartDto): Promise<unknown> {
    return this.kycService.startLivenessSession(user.id, dto.sessionType);
  }

  @Post('liveness/submit')
  livenessSubmit(@CurrentUser() user: User, @Body() dto: LivenessSubmitDto) {
    return this.kycService.submitLivenessSession(user.id, dto.sessionId, dto.frames, dto.deviceSensors);
  }

  @Get('tier')
  tier(@CurrentUser() user: User) {
    return this.kycService.getTierStatus(user.id);
  }

  @Post('tier/upgrade')
  tierUpgrade(@CurrentUser() user: User, @Body() dto: TierUpgradeDto) {
    return this.kycService.upgradeTier(user.id, dto);
  }
}
