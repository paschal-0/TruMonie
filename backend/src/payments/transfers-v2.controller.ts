import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Post,
  UseGuards
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User, UserStatus } from '../users/entities/user.entity';
import { UsersService } from '../users/users.service';
import { CreateTransferDto } from './dto/create-transfer.dto';
import { InternalTransferV2Dto } from './dto/internal-transfer-v2.dto';
import { NameEnquiryDto } from './dto/name-enquiry.dto';
import { SaveTransferBeneficiaryDto } from './dto/save-transfer-beneficiary.dto';
import { TransfersV2Service } from './transfers-v2.service';

@UseGuards(JwtAuthGuard)
@Controller('transfers')
export class TransfersV2Controller {
  constructor(
    private readonly usersService: UsersService,
    private readonly transfersService: TransfersV2Service
  ) {}

  @Post('name-enquiry')
  async nameEnquiry(@CurrentUser() user: User, @Body() dto: NameEnquiryDto) {
    this.assertUserActive(user);
    return this.transfersService.nameEnquiry({
      userId: user.id,
      destinationBankCode: dto.destination_bank_code,
      accountNumber: dto.account_number,
      providerName: dto.provider
    });
  }

  @Post()
  async createTransfer(@CurrentUser() user: User, @Body() dto: CreateTransferDto) {
    this.assertUserActive(user);
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    return this.transfersService.createBankTransfer({
      userId: user.id,
      sourceWalletId: dto.source_wallet_id,
      destinationBankCode: dto.destination_bank_code,
      destinationAccount: dto.destination_account,
      destinationName: dto.destination_name,
      amountMinor: dto.amount.toString(),
      narration: dto.narration,
      idempotencyKey: dto.idempotency_key,
      sessionId: dto.session_id,
      providerName: dto.provider
    });
  }

  @Post('internal')
  async internalTransfer(@CurrentUser() user: User, @Body() dto: InternalTransferV2Dto) {
    this.assertUserActive(user);
    await this.usersService.assertValidTransactionPin(user.id, dto.pin);
    return this.transfersService.createInternalTransfer({
      userId: user.id,
      sourceWalletId: dto.source_wallet_id,
      destinationWalletId: dto.destination_wallet_id,
      amountMinor: dto.amount.toString(),
      narration: dto.narration,
      idempotencyKey: dto.idempotency_key
    });
  }

  @Get(':transferId/status')
  async status(@CurrentUser() user: User, @Param('transferId') transferId: string) {
    return this.transfersService.getTransferStatus(user.id, transferId);
  }

  @Get(':transferId/receipt')
  async receipt(@CurrentUser() user: User, @Param('transferId') transferId: string) {
    return this.transfersService.getTransferReceipt(user.id, transferId);
  }

  private assertUserActive(user: User) {
    if (user.status === UserStatus.DISABLED) {
      throw new ForbiddenException('User is frozen');
    }
  }
}

@UseGuards(JwtAuthGuard)
@Controller('beneficiaries')
export class BeneficiariesController {
  constructor(private readonly transfersService: TransfersV2Service) {}

  @Post()
  async save(@CurrentUser() user: User, @Body() dto: SaveTransferBeneficiaryDto) {
    return this.transfersService.saveBeneficiary(user.id, {
      accountNumber: dto.account_number,
      bankCode: dto.bank_code,
      accountName: dto.account_name,
      alias: dto.alias,
      bankName: dto.bank_name
    });
  }

  @Get()
  async list(@CurrentUser() user: User) {
    return this.transfersService.listBeneficiaries(user.id);
  }

  @Delete(':id')
  async delete(@CurrentUser() user: User, @Param('id') id: string) {
    return this.transfersService.deleteBeneficiary(user.id, id);
  }
}
