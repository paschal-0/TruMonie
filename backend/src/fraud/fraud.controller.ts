import { Body, Controller, Get, Query, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { RolesGuard } from '../common/guards/roles.guard';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateFraudReportDto } from './dto/create-fraud-report.dto';
import { FraudService } from './fraud.service';
import { FraudDecision } from './entities/fraud-alert.entity';
import { FraudEventStatus } from './entities/fraud-transaction-event.entity';

@UseGuards(JwtAuthGuard)
@Controller('fraud/reports')
export class FraudController {
  constructor(private readonly fraudService: FraudService) {}

  @Post()
  createReport(@CurrentUser() user: User, @Body() dto: CreateFraudReportDto) {
    return this.fraudService.createReport({
      userId: user.id,
      transactionId: dto.transaction_id,
      reportType: dto.report_type,
      description: dto.description,
      reportedAmountMinor: dto.reported_amount.toString()
    });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('alerts')
  listAlerts(
    @Query('decision') decision?: FraudDecision,
    @Query('limit') limit?: string
  ) {
    return this.fraudService.listAlerts({
      decision,
      limit: limit ? Number.parseInt(limit, 10) : undefined
    });
  }

  @UseGuards(RolesGuard)
  @Roles(UserRole.ADMIN)
  @Get('events')
  listEvents(@Query('status') status?: FraudEventStatus, @Query('limit') limit?: string) {
    return this.fraudService.listEvents({
      status,
      limit: limit ? Number.parseInt(limit, 10) : undefined
    });
  }
}
