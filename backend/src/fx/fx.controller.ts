import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { ConvertDto } from './dto/convert.dto';
import { QuoteDto } from './dto/quote.dto';
import { RateDto } from './dto/rate.dto';
import { FxService } from './fx.service';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('fx')
export class FxController {
  constructor(
    private readonly fxService: FxService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService
  ) {}

  @Get('rate')
  async rate(@Query() dto: RateDto) {
    return { rate: await this.fxService.getRate(dto.base, dto.quote) };
  }

  @UseGuards(JwtAuthGuard)
  @Post('quote')
  async quote(@Body() dto: QuoteDto) {
    const q = await this.fxService.createQuote(dto.base, dto.quote, dto.amountMinor.toString());
    return { id: q.id, rate: q.rate, spreadBps: q.spreadBps };
  }

  @UseGuards(JwtAuthGuard)
  @Post('convert')
  async convert(@CurrentUser() user: User, @Body() dto: ConvertDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const conversion = await this.fxService.convert(
      user.id,
      dto.quoteId,
      dto.base,
      dto.quote,
      dto.amountMinor.toString()
    );
    await this.notificationsService.send(
      user.id,
      'FX_CONVERT',
      `FX conversion of ${dto.amountMinor} ${dto.base} to ${dto.quote} completed`
    );
    return conversion;
  }
}
