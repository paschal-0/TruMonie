import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { Transfer } from '../payments/entities/transfer.entity';
import { TransferBeneficiary } from '../payments/entities/transfer-beneficiary.entity';
import { RolesGuard } from '../common/guards/roles.guard';
import { RiskModule } from '../risk/risk.module';
import { ComplianceModule } from '../compliance/compliance.module';
import { FraudController } from './fraud.controller';
import { FraudEngineService } from './fraud-engine.service';
import { FraudService } from './fraud.service';
import { FraudAlert } from './entities/fraud-alert.entity';
import { FraudTransactionEvent } from './entities/fraud-transaction-event.entity';
import { FraudReport } from './entities/fraud-report.entity';

@Module({
  imports: [
    RiskModule,
    ComplianceModule,
    TypeOrmModule.forFeature([FraudReport, FraudAlert, FraudTransactionEvent, Transfer, TransferBeneficiary])
  ],
  controllers: [FraudController],
  providers: [FraudEngineService, FraudService, RolesGuard],
  exports: [FraudService]
})
export class FraudModule {}
