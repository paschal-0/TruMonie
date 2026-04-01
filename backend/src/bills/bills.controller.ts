import { randomUUID } from 'crypto';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AccountsService } from '../ledger/accounts.service';
import { Currency } from '../ledger/enums/currency.enum';
import { User } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { NqrPayDto } from './dto/nqr-pay.dto';
import { PayBillDto } from './dto/pay-bill.dto';
import { PurchaseBillDto } from './dto/purchase-bill.dto';
import { SaveBeneficiaryDto } from './dto/save-beneficiary.dto';
import { ValidateBillDto } from './dto/validate-bill.dto';
import { BillsService } from './bills.service';

@Controller('bills')
export class BillsController {
  constructor(
    private readonly billsService: BillsService,
    private readonly configService: ConfigService,
    private readonly usersService: UsersService,
    private readonly accountsService: AccountsService
  ) {}

  @Get('catalog')
  async catalog() {
    return this.billsService.catalog();
  }

  @Get('categories')
  async categories() {
    return this.billsService.categories();
  }

  @UseGuards(JwtAuthGuard)
  @Post('validate')
  async validate(@CurrentUser() user: User, @Body() dto: ValidateBillDto) {
    return this.billsService.validateBill({
      userId: user.id,
      billerId: dto.biller_id,
      fields: dto.fields
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('pay')
  async pay(@CurrentUser() user: User, @Body() dto: PayBillDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const systemAccounts = this.configService.get('systemAccounts');
    return this.billsService.payBill({
      userId: user.id,
      walletId: dto.wallet_id,
      billerId: dto.biller_id,
      validationRef: dto.validation_ref,
      customerRef: dto.customer_ref,
      amountMinor: dto.amount.toString(),
      currency: dto.currency,
      idempotencyKey: dto.idempotency_key,
      systemAccounts
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('nqr/pay')
  async payNqr(@CurrentUser() user: User, @Body() dto: NqrPayDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const systemAccounts = this.configService.get('systemAccounts');
    return this.billsService.payNqr({
      userId: user.id,
      walletId: dto.wallet_id,
      qrData: dto.qr_data,
      amountMinor: dto.amount.toString(),
      currency: dto.currency ?? Currency.NGN,
      idempotencyKey: dto.idempotency_key,
      systemAccounts
    });
  }

  @UseGuards(JwtAuthGuard)
  @Post('purchase')
  async purchaseLegacy(@CurrentUser() user: User, @Body() dto: PurchaseBillDto) {
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    const wallets = await this.accountsService.getUserAccounts(user.id);
    const wallet = wallets.find((entry) => entry.currency === dto.currency);
    if (!wallet) {
      return {
        status: 'FAILED',
        message: `Wallet not found for ${dto.currency}`
      };
    }
    const systemAccounts = this.configService.get('systemAccounts');
    return this.billsService.payBill({
      userId: user.id,
      walletId: wallet.id,
      billerId: dto.productCode,
      customerRef: dto.beneficiary,
      amountMinor: dto.amountMinor.toString(),
      currency: dto.currency,
      idempotencyKey: randomUUID(),
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

  @UseGuards(JwtAuthGuard)
  @Delete('beneficiaries/:id')
  deleteBene(@CurrentUser() user: User, @Param('id') id: string) {
    return this.billsService.deleteBeneficiary(user.id, id);
  }
}
