import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { User } from '../users/entities/user.entity';
import { AjoService } from './ajo.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupScheduleDto } from './dto/update-group-schedule.dto';
import { ReorderMembersDto } from './dto/reorder-members.dto';
import { RemoveMemberDto } from './dto/remove-member.dto';
import { ReplaceMemberDto } from './dto/replace-member.dto';

@UseGuards(JwtAuthGuard)
@Controller('ajo')
export class AjoController {
  constructor(private readonly ajoService: AjoService) {}

  @Get('groups')
  list(@CurrentUser() user: User) {
    return this.ajoService.listGroupsForUser(user.id);
  }

  @Get('groups/:id')
  get(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ajoService.getGroupDetails(user.id, id);
  }

  @Post('groups')
  create(@CurrentUser() user: User, @Body() dto: CreateGroupDto) {
    return this.ajoService.createGroup(user, dto);
  }

  @Post('groups/:id/join')
  join(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ajoService.joinGroup(user, id);
  }

  @Post('groups/:id/run-cycle')
  runCycle(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ajoService.runCycle(id, user);
  }

  @Patch('groups/:id/schedule')
  updateSchedule(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: UpdateGroupScheduleDto
  ) {
    return this.ajoService.updateSchedule(id, user, dto);
  }

  @Patch('groups/:id/reorder')
  reorder(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReorderMembersDto
  ) {
    return this.ajoService.reorderMembers(id, user, dto);
  }

  @Patch('groups/:id/remove')
  remove(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: RemoveMemberDto
  ) {
    return this.ajoService.removeMember(id, user, dto);
  }

  @Patch('groups/:id/replace')
  replace(
    @CurrentUser() user: User,
    @Param('id') id: string,
    @Body() dto: ReplaceMemberDto
  ) {
    return this.ajoService.replaceMember(id, user, dto);
  }

  @Post('groups/:id/settle-penalties')
  settlePenalties(@CurrentUser() user: User, @Param('id') id: string) {
    return this.ajoService.settleOutstandingPenalties(id, user);
  }
}
