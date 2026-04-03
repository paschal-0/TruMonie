import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { UserRole } from '../users/entities/user.entity';
import { CoreBankingAsOfQueryDto, CoreBankingRangeQueryDto, Mmfbr300QueryDto } from './dto/core-banking-report-query.dto';
import { CreateProfitPoolDto } from './dto/create-profit-pool.dto';
import { DistributeProfitDto } from './dto/distribute-profit.dto';
import { CoreBankingService } from './core-banking.service';

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('core-banking')
export class CoreBankingController {
  constructor(private readonly coreBankingService: CoreBankingService) {}

  @Post('gl/initialize')
  initializeChartOfAccounts() {
    return this.coreBankingService.initializeChartOfAccounts();
  }

  @Get('gl/accounts')
  listGlAccounts() {
    return this.coreBankingService.listGlAccounts();
  }

  @Get('gl/trial-balance')
  trialBalance(@Query() query: CoreBankingAsOfQueryDto) {
    return this.coreBankingService.getTrialBalance(query.as_of);
  }

  @Get('gl/balance-sheet')
  balanceSheet(@Query() query: CoreBankingAsOfQueryDto) {
    return this.coreBankingService.getBalanceSheet(query.as_of);
  }

  @Get('gl/income-statement')
  incomeStatement(@Query() query: CoreBankingRangeQueryDto) {
    return this.coreBankingService.getIncomeStatement(query.from, query.to);
  }

  @Get('regulatory/mmfbr300')
  mmfbr300(@Query() query: Mmfbr300QueryDto) {
    return this.coreBankingService.generateMmfbr300(query.month);
  }

  @Post('profit-pools')
  createProfitPool(@Body() dto: CreateProfitPoolDto) {
    return this.coreBankingService.createProfitPool(dto);
  }

  @Get('profit-pools')
  listProfitPools() {
    return this.coreBankingService.listProfitPools();
  }

  @Get('profit-pools/:poolId/distributions')
  listPoolDistributions(@Param('poolId') poolId: string) {
    return this.coreBankingService.listPoolDistributions(poolId);
  }

  @Post('profit-pools/:poolId/distribute')
  distributeProfit(@Param('poolId') poolId: string, @Body() dto: DistributeProfitDto) {
    return this.coreBankingService.distributeProfit(poolId, dto);
  }
}

