import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { VerifyKycDto } from './dto/verify-kyc.dto';
import { KycService } from './kyc.service';

@UseGuards(JwtAuthGuard)
@Controller('kyc')
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post('verify')
  verify(@CurrentUser() user: User, @Body() dto: VerifyKycDto) {
    return this.kycService.verify(user.id, dto);
  }
}
