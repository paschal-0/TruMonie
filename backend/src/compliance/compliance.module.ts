import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';
import { ComplianceEvent } from './entities/compliance-event.entity';

@Module({
  imports: [TypeOrmModule.forFeature([ComplianceEvent])],
  controllers: [ComplianceController],
  providers: [ComplianceService],
  exports: [ComplianceService]
})
export class ComplianceModule {}
