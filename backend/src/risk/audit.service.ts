import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { Repository } from 'typeorm';

import { AuditActionType, AuditActorType, AuditLog } from './entities/audit-log.entity';

export interface AuditRecordInput {
  actorId?: string | null;
  actorType?: AuditActorType;
  eventType: string;
  actionType?: AuditActionType;
  resourceType?: string;
  resourceId?: string;
  beforeState?: Record<string, unknown> | null;
  afterState?: Record<string, unknown> | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  correlationId?: string;
  metadata?: Record<string, unknown> | null;
}

@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditRepo: Repository<AuditLog>
  ) {}

  async record(userId: string, action: string, metadata?: Record<string, unknown>): Promise<void>;
  async record(input: AuditRecordInput): Promise<void>;
  async record(
    userIdOrInput: string | AuditRecordInput,
    action?: string,
    metadata?: Record<string, unknown>
  ): Promise<void> {
    const payload =
      typeof userIdOrInput === 'string'
        ? this.normalizeLegacy(userIdOrInput, action ?? 'AUDIT_EVENT', metadata)
        : this.normalizeInput(userIdOrInput);

    await this.auditRepo.save(
      this.auditRepo.create({
        userId: payload.actorId,
        eventType: payload.eventType,
        actorType: payload.actorType,
        resourceType: payload.resourceType,
        resourceId: payload.resourceId,
        actionType: payload.actionType,
        beforeState: payload.beforeState,
        afterState: payload.afterState,
        ipAddress: payload.ipAddress,
        userAgent: payload.userAgent,
        correlationId: payload.correlationId,
        action: payload.eventType,
        metadata: payload.metadata
      })
    );
  }

  private normalizeLegacy(userId: string, eventType: string, metadata?: Record<string, unknown>) {
    return this.normalizeInput({
      actorId: userId,
      actorType: AuditActorType.USER,
      eventType,
      actionType: this.inferActionType(eventType),
      resourceType: 'SYSTEM',
      resourceId: userId,
      metadata: metadata ?? null
    });
  }

  private normalizeInput(input: AuditRecordInput) {
    const eventType = input.eventType?.trim() || 'AUDIT_EVENT';
    const actorType = input.actorType ?? AuditActorType.USER;
    const actionType = input.actionType ?? this.inferActionType(eventType);
    return {
      actorId: input.actorId ?? null,
      actorType,
      eventType,
      actionType,
      resourceType: input.resourceType ?? 'SYSTEM',
      resourceId: input.resourceId ?? input.actorId ?? randomUUID(),
      beforeState: input.beforeState ?? null,
      afterState: input.afterState ?? null,
      ipAddress: input.ipAddress ?? null,
      userAgent: input.userAgent ?? null,
      correlationId: input.correlationId ?? randomUUID(),
      metadata: input.metadata ?? null
    };
  }

  private inferActionType(eventType: string): AuditActionType {
    const upper = eventType.toUpperCase();
    if (upper.includes('CREATE') || upper.includes('SUBMITTED')) return AuditActionType.CREATE;
    if (upper.includes('DELETE') || upper.includes('REMOVE')) return AuditActionType.DELETE;
    if (upper.includes('VIEW') || upper.includes('READ')) return AuditActionType.VIEW;
    return AuditActionType.UPDATE;
  }
}
