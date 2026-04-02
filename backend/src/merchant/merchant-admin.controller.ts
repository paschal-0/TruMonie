import {
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { AdminProcessSettlementDto } from './dto/admin-process-settlement.dto';
import { AdminUpdateMerchantStatusDto } from './dto/admin-update-merchant-status.dto';
import { AdminUpdateSettlementStatusDto } from './dto/admin-update-settlement-status.dto';
import { AdminUpdateTerminalStatusDto } from './dto/admin-update-terminal-status.dto';
import { PosChargeDto } from './dto/pos-charge.dto';
import { MerchantService } from './merchant.service';

@Controller('admin/merchants')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
export class MerchantAdminController {
  constructor(private readonly merchantService: MerchantService) {}

  @Get('overview')
  overview() {
    return this.merchantService.adminOverview();
  }

  @Get()
  listMerchants(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage = 20,
    @Query('status') status?: string,
    @Query('query') query?: string
  ) {
    return this.merchantService.adminListMerchants({ page, perPage, status, query });
  }

  @Patch(':id/status')
  updateMerchantStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: AdminUpdateMerchantStatusDto
  ) {
    return this.merchantService.adminUpdateMerchantStatus({
      adminUserId: admin.id,
      merchantId: id,
      status: dto.status,
      reason: dto.reason
    });
  }

  @Get('terminals')
  listTerminals(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage = 20,
    @Query('status') status?: string,
    @Query('merchantId') merchantId?: string,
    @Query('query') query?: string
  ) {
    return this.merchantService.adminListTerminals({
      page,
      perPage,
      status,
      merchantId,
      query
    });
  }

  @Patch('terminals/:id/status')
  updateTerminalStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: AdminUpdateTerminalStatusDto
  ) {
    return this.merchantService.adminUpdateTerminalStatus({
      adminUserId: admin.id,
      terminalId: id,
      status: dto.status
    });
  }

  @Post('terminals/:id/heartbeat')
  terminalHeartbeat(@CurrentUser() admin: User, @Param('id') id: string) {
    return this.merchantService.adminTerminalHeartbeat({
      adminUserId: admin.id,
      terminalId: id
    });
  }

  @Get('settlements')
  listSettlements(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage = 20,
    @Query('status') status?: string,
    @Query('cycle') cycle?: string,
    @Query('merchantId') merchantId?: string
  ) {
    return this.merchantService.adminListSettlements({
      page,
      perPage,
      status,
      cycle,
      merchantId
    });
  }

  @Patch('settlements/:id/status')
  updateSettlementStatus(
    @CurrentUser() admin: User,
    @Param('id') id: string,
    @Body() dto: AdminUpdateSettlementStatusDto
  ) {
    return this.merchantService.adminUpdateSettlementStatus({
      adminUserId: admin.id,
      settlementId: id,
      status: dto.status
    });
  }

  @Get('transactions')
  listTransactions(
    @Query('page', new ParseIntPipe({ optional: true })) page = 1,
    @Query('perPage', new ParseIntPipe({ optional: true })) perPage = 20,
    @Query('status') status?: string,
    @Query('channel') channel?: string,
    @Query('merchantId') merchantId?: string
  ) {
    return this.merchantService.adminListTransactions({
      page,
      perPage,
      status,
      channel,
      merchantId
    });
  }

  @Post('transactions/charge')
  chargePos(@Body() dto: PosChargeDto) {
    return this.merchantService.chargePos(dto);
  }

  @Get(':id')
  details(@Param('id') id: string) {
    return this.merchantService.adminGetMerchantDetails(id);
  }

  @Post('settlements/process')
  processSettlements(@CurrentUser() admin: User, @Body() dto: AdminProcessSettlementDto) {
    return this.merchantService.adminProcessSettlementCycle({
      adminUserId: admin.id,
      cycle: dto.cycle
    });
  }
}
