import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLog } from './entities/audit-log.entity';

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>
  ) {}

  async record(userId: string, action: string, metadata?: Record<string, unknown>) {
    await this.auditRepo.save(
      this.auditRepo.create({
        userId,
        action,
        metadata: metadata ?? null
      })
    );
  }
}
