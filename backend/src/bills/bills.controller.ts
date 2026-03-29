import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { PurchaseBillDto } from './dto/purchase-bill.dto';
import { BillsService } from './bills.service';
import { SaveBeneficiaryDto } from './dto/save-beneficiary.dto';

@Controller('bills')
export class BillsController {
  constructor(
    private readonly billsService: BillsService,
    private readonly configService: ConfigService
  ) {}

  @Get('catalog')
  async catalog() {
    return this.billsService.catalog();
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async purchase(@CurrentUser() user: User, @Body() dto: PurchaseBillDto) {
    const systemAccounts = this.configService.get('systemAccounts');
    return this.billsService.purchase({
      userId: user.id,
      currency: dto.currency,
      amountMinor: dto.amountMinor.toString(),
      productCode: dto.productCode,
      beneficiary: dto.beneficiary,
      description: dto.description,
      systemAccounts
    });
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
