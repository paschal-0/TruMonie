import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import {
  ComplianceEvent,
  ComplianceResolution,
  ComplianceRiskLevel
} from './entities/compliance-event.entity';

@Injectable()
export class ComplianceService {
  constructor(
    @InjectRepository(ComplianceEvent)
    private readonly complianceRepo: Repository<ComplianceEvent>
  ) {}

  async emit(params: {
    eventType: string;
    referenceId: string;
    userId?: string | null;
    riskLevel: ComplianceRiskLevel;
    details: Record<string, unknown>;
  }) {
    return this.complianceRepo.save(
      this.complianceRepo.create({
        eventType: params.eventType,
        referenceId: params.referenceId,
        userId: params.userId ?? null,
        riskLevel: params.riskLevel,
        details: params.details,
        resolution: null,
        resolvedBy: null,
        resolvedAt: null,
        nfiuReported: false,
        nfiuReportRef: null
      })
    );
  }

  async list(params: {
    eventType?: string;
    riskLevel?: ComplianceRiskLevel;
    resolution?: ComplianceResolution;
    limit?: number;
  }) {
    const qb = this.complianceRepo.createQueryBuilder('event').orderBy('event.createdAt', 'DESC');
    if (params.eventType) {
      qb.andWhere('event.eventType = :eventType', { eventType: params.eventType });
    }
    if (params.riskLevel) {
      qb.andWhere('event.riskLevel = :riskLevel', { riskLevel: params.riskLevel });
    }
    if (params.resolution) {
      qb.andWhere('event.resolution = :resolution', { resolution: params.resolution });
    }
    qb.take(Math.min(Math.max(params.limit ?? 50, 1), 200));
    return qb.getMany();
  }

  async resolve(
    id: string,
    params: {
      resolution: ComplianceResolution;
      resolvedBy: string;
      nfiuReported?: boolean;
      nfiuReportRef?: string;
    }
  ) {
    const event = await this.complianceRepo.findOne({ where: { id } });
    if (!event) {
      throw new NotFoundException('Compliance event not found');
    }
    event.resolution = params.resolution;
    event.resolvedBy = params.resolvedBy;
    event.resolvedAt = new Date();
    event.nfiuReported = Boolean(params.nfiuReported);
    event.nfiuReportRef = params.nfiuReportRef ?? null;
    return this.complianceRepo.save(event);
  }
}
