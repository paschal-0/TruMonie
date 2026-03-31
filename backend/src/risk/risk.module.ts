import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { AuditLog } from './entities/audit-log.entity';
import { UserDevice } from './entities/user-device.entity';
import { CircuitBreaker } from './entities/circuit-breaker.entity';
import { AuditService } from './audit.service';
import { VelocityService } from './velocity.service';
import { RiskController } from './risk.controller';
import { RolesGuard } from '../common/guards/roles.guard';
import { DeviceBindingsService } from './device-bindings.service';
import { CircuitBreakerService } from './circuit-breaker.service';

@Module({
  imports: [
    LedgerModule,
    UsersModule,
    NotificationsModule,
    TypeOrmModule.forFeature([AuditLog, UserDevice, CircuitBreaker])
  ],
  providers: [
    AuditService,
    VelocityService,
    CircuitBreakerService,
    DeviceBindingsService,
    RolesGuard
  ],
  controllers: [RiskController],
  exports: [AuditService, VelocityService, CircuitBreakerService, DeviceBindingsService]
})
export class RiskModule {}
