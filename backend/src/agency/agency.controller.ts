import {
  Body,
  Controller,
  Get,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards
} from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AgentCashInDto } from './dto/agent-cash-in.dto';
import { AgentCashOutDto } from './dto/agent-cash-out.dto';
import { CreateAgentDto } from './dto/create-agent.dto';
import { UpdateAgentWalletConfigDto } from './dto/update-agent-wallet-config.dto';
import { AgencyService } from './agency.service';

@UseGuards(JwtAuthGuard)
@Controller(['agents', 'agency'])
export class AgencyController {
  constructor(private readonly agencyService: AgencyService) {}

  @Post('onboard')
  onboard(@CurrentUser() user: User, @Body() dto: CreateAgentDto) {
    return this.agencyService.onboard(user.id, dto);
  }

  @Get('me')
  me(@CurrentUser() user: User) {
    return this.agencyService.getMyAgent(user.id);
  }

  @Patch('me/wallet-config')
  updateWalletConfig(@CurrentUser() user: User, @Body() dto: UpdateAgentWalletConfigDto) {
    return this.agencyService.updateMyWalletConfig(user.id, dto);
  }

  @Get('me/metrics')
  metrics(@CurrentUser() user: User) {
    return this.agencyService.getMyMetrics(user.id);
  }

  @Get('me/transactions')
  transactions(
    @CurrentUser() user: User,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50
  ) {
    return this.agencyService.listMyTransactions(user.id, limit);
  }

  @Get('me/commissions')
  commissions(
    @CurrentUser() user: User,
    @Query('limit', new ParseIntPipe({ optional: true })) limit = 50
  ) {
    return this.agencyService.listMyCommissions(user.id, limit);
  }

  @Post('cash-in')
  cashIn(@CurrentUser() user: User, @Body() dto: AgentCashInDto) {
    return this.agencyService.cashIn(user.id, dto);
  }

  @Post('cash-out')
  cashOut(@CurrentUser() user: User, @Body() dto: AgentCashOutDto) {
    return this.agencyService.cashOut(user.id, dto);
  }
}

