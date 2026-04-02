import { Body, Controller, Get, ParseIntPipe, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { PosChargeDto } from './dto/pos-charge.dto';
import { RequestPosDto } from './dto/request-pos.dto';
import { MerchantService } from './merchant.service';

@Controller(['merchants', 'merchant'])
@UseGuards(JwtAuthGuard)
export class MerchantController {
  constructor(private readonly merchantService: MerchantService) {}

  @Post()
  create(@CurrentUser() user: User, @Body() dto: CreateMerchantDto) {
    return this.merchantService.create(user, dto);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.merchantService.getMyMerchant(user.id);
  }

  @Get('me/terminals')
  terminals(@CurrentUser() user: User) {
    return this.merchantService.listMyTerminals(user.id);
  }

  @Get('me/settlements')
  settlements(
    @CurrentUser() user: User,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 30
  ) {
    return this.merchantService.listMySettlements(user.id, limit);
  }

  @Get('me/transactions')
  transactions(
    @CurrentUser() user: User,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50
  ) {
    return this.merchantService.listMyTransactions(user.id, limit);
  }

  @Post('me/pos-request')
  requestPos(@CurrentUser() user: User, @Body() dto: RequestPosDto) {
    return this.merchantService.requestPos(user, dto);
  }

  @Post('pos/charge')
  chargePos(@Body() dto: PosChargeDto) {
    return this.merchantService.chargePos(dto);
  }
}
