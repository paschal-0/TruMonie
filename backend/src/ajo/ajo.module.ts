import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';
import { AjoController } from './ajo.controller';
import { AjoService } from './ajo.service';
import { GroupContribution } from './entities/group-contribution.entity';
import { GroupMember } from './entities/group-member.entity';
import { GroupPayout } from './entities/group-payout.entity';
import { GroupActivity } from './entities/group-activity.entity';
import { AjoQueue } from './ajo.queue';
import { NotificationsModule } from '../notifications/notifications.module';
import { SavingsGroup } from './entities/savings-group.entity';

@Module({
  imports: [
    LedgerModule,
    NotificationsModule,
    UsersModule,
    TypeOrmModule.forFeature([SavingsGroup, GroupMember, GroupContribution, GroupPayout, GroupActivity])
  ],
  controllers: [AjoController],
  providers: [AjoService, AjoQueue],
  exports: [AjoService]
})
export class AjoModule {}
