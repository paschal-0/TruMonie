import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { PurchaseBillDto } from './dto/purchase-bill.dto';
import { BillsService } from './bills.service';
import { SaveBeneficiaryDto } from './dto/save-beneficiary.dto';
import { NotificationsService } from '../notifications/notifications.service';

@Controller('bills')
export class BillsController {
  constructor(
    private readonly billsService: BillsService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly notificationsService: NotificationsService
  ) {}

  @Get('catalog')
  async catalog() {
    return this.billsService.catalog();
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async purchase(@CurrentUser() user: User, @Body() dto: PurchaseBillDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const systemAccounts = this.configService.get('systemAccounts');
    const purchase = await this.billsService.purchase({
      userId: user.id,
      currency: dto.currency,
      amountMinor: dto.amountMinor.toString(),
      productCode: dto.productCode,
      beneficiary: dto.beneficiary,
      description: dto.description,
      systemAccounts
    });
    await this.notificationsService.send(
      user.id,
      'BILL_PURCHASE',
      `Bill payment of ${dto.amountMinor} ${dto.currency} completed for ${dto.productCode}`
    );
    return purchase;
  }

  @UseGuards(JwtAuthGuard)
  @Post('beneficiaries')
  saveBene(@CurrentUser() user: User, @Body() dto: SaveBeneficiaryDto) {
    return this.billsService.saveBeneficiary(user.id, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get('beneficiaries')
  listBenes(@CurrentUser() user: User) {
    return this.billsService.listBeneficiaries(user.id);
  }
}
