import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AuditLog } from '../risk/entities/audit-log.entity';

@Injectable()
export class AdminAuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>
  ) {}

  async list(input: {
    startDate?: string;
    endDate?: string;
    actorId?: string;
    actorType?: string;
    resourceType?: string;
    action?: string;
    correlationId?: string;
  }) {
    const qb = this.auditRepo.createQueryBuilder('log').orderBy('log.createdAt', 'DESC').take(500);
    if (input.startDate) qb.andWhere('log.createdAt >= :startDate', { startDate: input.startDate });
    if (input.endDate) qb.andWhere('log.createdAt <= :endDate', { endDate: input.endDate });
    if (input.actorId) qb.andWhere('log.userId = :actorId', { actorId: input.actorId });
    if (input.actorType) qb.andWhere('log.actorType = :actorType', { actorType: input.actorType });
    if (input.resourceType)
      qb.andWhere('log.resourceType = :resourceType', {
        resourceType: input.resourceType.toUpperCase()
      });
    if (input.action) qb.andWhere('log.actionType = :action', { action: input.action.toUpperCase() });
    if (input.correlationId)
      qb.andWhere('log.correlationId = :correlationId', { correlationId: input.correlationId });

    const logs = await qb.getMany();
    return {
      logs: logs.map((log) => ({
        id: log.id,
        event_type: log.eventType,
        actor: {
          id: log.userId,
          type: log.actorType
        },
        resource: {
          type: log.resourceType,
          id: log.resourceId
        },
        action: log.actionType,
        before: log.beforeState,
        after: log.afterState,
        ip_address: log.ipAddress,
        user_agent: log.userAgent,
        correlation_id: log.correlationId,
        metadata: log.metadata,
        created_at: log.createdAt
      }))
    };
  }

  async exportCsv(input: {
    startDate?: string;
    endDate?: string;
    actorId?: string;
    actorType?: string;
    resourceType?: string;
    action?: string;
    correlationId?: string;
  }) {
    const payload = await this.list(input);
    const header = [
      'id',
      'event_type',
      'actor_id',
      'actor_type',
      'resource_type',
      'resource_id',
      'action',
      'correlation_id',
      'created_at'
    ];
    const rows = payload.logs.map((log) =>
      [
        log.id,
        log.event_type ?? '',
        log.actor.id ?? '',
        log.actor.type ?? '',
        log.resource.type ?? '',
        log.resource.id ?? '',
        log.action ?? '',
        log.correlation_id ?? '',
        log.created_at.toISOString()
      ]
        .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
        .join(',')
    );
    return [header.join(','), ...rows].join('\n');
  }
}
