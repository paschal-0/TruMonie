import { Body, Controller, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { RemittanceService } from './remittance.service';
import { OutboundRemittanceDto } from './dto/outbound-remittance.dto';
import { InboundRemittanceDto } from './dto/inbound-remittance.dto';
import { NotificationsService } from '../notifications/notifications.service';

@UseGuards(JwtAuthGuard)
@Controller('remittance')
export class RemittanceController {
  constructor(
    private readonly remittanceService: RemittanceService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService
  ) {}

  @Post('outbound')
  async outbound(@CurrentUser() user: User, @Body() dto: OutboundRemittanceDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const tx = await this.remittanceService.outbound(
      user.id,
      dto.amountMinor.toString(),
      dto.currency,
      dto.destination,
      dto.provider,
      dto.narration
    );
    await this.notificationsService.send(
      user.id,
      'REMITTANCE_OUTBOUND',
      `Outbound remittance of ${dto.amountMinor} ${dto.currency} created`
    );
    return tx;
  }

  @Post('inbound')
  async inbound(@CurrentUser() user: User, @Body() dto: InboundRemittanceDto) {
    const tx = await this.remittanceService.inbound(
      user.id,
      dto.amountMinor.toString(),
      dto.currency,
      dto.provider,
      dto.reference
    );
    await this.notificationsService.send(
      user.id,
      'REMITTANCE_INBOUND',
      `Inbound remittance of ${dto.amountMinor} ${dto.currency} received`
    );
    return tx;
  }
}
