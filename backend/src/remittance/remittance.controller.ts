import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { RemittanceService } from './remittance.service';
import { OutboundRemittanceDto } from './dto/outbound-remittance.dto';
import { InboundRemittanceDto } from './dto/inbound-remittance.dto';

@UseGuards(JwtAuthGuard)
@Controller('remittance')
export class RemittanceController {
  constructor(private readonly remittanceService: RemittanceService) {}

  @Post('outbound')
  outbound(@CurrentUser() user: User, @Body() dto: OutboundRemittanceDto) {
    return this.remittanceService.outbound(
      user.id,
      dto.amountMinor.toString(),
      dto.currency,
      dto.destination,
      dto.provider,
      dto.narration
    );
  }

  @Post('inbound')
  inbound(@CurrentUser() user: User, @Body() dto: InboundRemittanceDto) {
    return this.remittanceService.inbound(
      user.id,
      dto.amountMinor.toString(),
      dto.currency,
      dto.provider,
      dto.reference
    );
  }
}
