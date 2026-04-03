import { HttpStatus, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import { IsNull, LessThanOrEqual, Repository } from 'typeorm';

import { AdminErrorCode, AdminException } from './admin.errors';
import {
  RegulatorySubmission,
  RegulatorySubmissionStatus,
  RegulatorySubmissionType
} from './entities/regulatory-submission.entity';

type SlsgResult = {
  reference: string;
  status: RegulatorySubmissionStatus;
  message: string;
};

@Injectable()
export class SlsgService implements OnModuleInit, OnModuleDestroy {
  private retryTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly configService: ConfigService,
    @InjectRepository(RegulatorySubmission)
    private readonly submissionsRepo: Repository<RegulatorySubmission>
  ) {}

  onModuleInit() {
    this.retryTimer = setInterval(() => {
      void this.retryFailedSubmissions();
    }, 120_000);
  }

  onModuleDestroy() {
    if (this.retryTimer) clearInterval(this.retryTimer);
    this.retryTimer = null;
  }

  async submitLicenseRenewal(payload: Record<string, unknown>, userId: string) {
    return this.submit(RegulatorySubmissionType.LICENSE_RENEWAL, '/slsg/v1/licenses/renew', payload, {
      submittedBy: userId
    });
  }

  async submitPeriodicReturn(params: {
    reportType: string;
    period: string;
    data: Record<string, unknown>;
    submittedBy: string;
  }) {
    return this.submit(
      RegulatorySubmissionType.PERIODIC_RETURN,
      '/slsg/v1/returns/submit',
      {
        report_type: params.reportType,
        period: params.period,
        data: params.data,
        institution_code: this.configService.get<string>('platformAdmin.institutionCode')
      },
      {
        reportType: params.reportType,
        period: params.period,
        submittedBy: params.submittedBy
      }
    );
  }

  async submitIncident(payload: Record<string, unknown>, userId: string) {
    return this.submit(RegulatorySubmissionType.INCIDENT_REPORT, '/slsg/v1/incidents/report', payload, {
      submittedBy: userId
    });
  }

  async submitAttestation(payload: Record<string, unknown>, userId: string) {
    return this.submit(
      RegulatorySubmissionType.COMPLIANCE_ATTESTATION,
      '/slsg/v1/attestations/submit',
      payload,
      {
        submittedBy: userId
      }
    );
  }

  async list(params: { status?: string; type?: string }) {
    const qb = this.submissionsRepo.createQueryBuilder('s').orderBy('s.createdAt', 'DESC');
    if (params.status) qb.andWhere('s.status = :status', { status: params.status });
    if (params.type) qb.andWhere('s.submissionType = :type', { type: params.type });
    const rows = await qb.getMany();
    return rows.map((row) => this.toPayload(row));
  }

  async handleCallback(
    payload: { reference: string; status: string; message?: string },
    signature?: string
  ) {
    const callbackSecret = this.configService.get<string>('platformAdmin.slsg.apiKey');
    if (callbackSecret && callbackSecret !== signature) {
      throw new AdminException(
        AdminErrorCode.SLSG_UNAVAILABLE,
        'Invalid SLSG callback signature',
        HttpStatus.FORBIDDEN
      );
    }
    const row = await this.submissionsRepo.findOne({
      where: { slsgReference: payload.reference }
    });
    if (!row) {
      return { updated: false };
    }
    row.status = this.normalizeStatus(payload.status);
    row.statusMessage = payload.message ?? row.statusMessage;
    await this.submissionsRepo.save(row);
    return { updated: true, id: row.id, status: row.status };
  }

  private async submit(
    submissionType: RegulatorySubmissionType,
    path: string,
    payload: Record<string, unknown>,
    metadata: { reportType?: string; period?: string; submittedBy: string }
  ) {
    try {
      const result = await this.callSlsg(path, payload);
      const row = await this.submissionsRepo.save(
        this.submissionsRepo.create({
          submissionType,
          reportType: metadata.reportType ?? null,
          period: metadata.period ?? null,
          payload,
          slsgReference: result.reference,
          status: result.status,
          statusMessage: result.message,
          submittedBy: metadata.submittedBy,
          submittedAt: new Date()
        })
      );
      return this.toPayload(row);
    } catch (error) {
      const row = await this.submissionsRepo.save(
        this.submissionsRepo.create({
          submissionType,
          reportType: metadata.reportType ?? null,
          period: metadata.period ?? null,
          payload: {
            ...payload,
            __retryCount: 0
          },
          slsgReference: null,
          status: RegulatorySubmissionStatus.FAILED,
          statusMessage: error instanceof Error ? error.message : 'submission failed',
          submittedBy: metadata.submittedBy,
          submittedAt: new Date()
        })
      );
      return this.toPayload(row);
    }
  }

  private async callSlsg(path: string, body: Record<string, unknown>): Promise<SlsgResult> {
    const baseUrl = this.configService.get<string>('platformAdmin.slsg.baseUrl');
    const apiKey = this.configService.get<string>('platformAdmin.slsg.apiKey');
    const timeoutMs = this.configService.get<number>('platformAdmin.slsg.timeoutMs', 10000);

    if (!baseUrl || !apiKey) {
      throw new AdminException(
        AdminErrorCode.SLSG_UNAVAILABLE,
        'SLSG integration unavailable',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    let lastError: unknown = null;
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(new URL(path, baseUrl).toString(), {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            authorization: `Bearer ${apiKey}`
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });

        const payload = await response
          .json()
          .catch(() => ({ reference: randomUUID(), status: response.ok ? 'accepted' : 'failed' }));
        if (!response.ok) {
          lastError = {
            status: response.status,
            payload
          };
          continue;
        }
        return {
          reference: String(payload.reference ?? payload.id ?? randomUUID()),
          status: RegulatorySubmissionStatus.ACCEPTED,
          message: String(payload.message ?? 'accepted')
        };
      } catch (error) {
        lastError = error;
      } finally {
        clearTimeout(timer);
      }
      await this.sleep(attempt * 500);
    }
    throw new AdminException(
      AdminErrorCode.SLSG_UNAVAILABLE,
      'SLSG integration unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
      {
        reason:
          lastError instanceof Error
            ? lastError.message
            : typeof lastError === 'object'
            ? lastError
            : 'Unknown error'
      }
    );
  }

  private toPayload(row: RegulatorySubmission) {
    return {
      id: row.id,
      submission_type: row.submissionType,
      report_type: row.reportType,
      period: row.period,
      payload: row.payload,
      slsg_reference: row.slsgReference,
      status: row.status,
      status_message: row.statusMessage,
      submitted_by: row.submittedBy,
      submitted_at: row.submittedAt,
      created_at: row.createdAt
    };
  }

  private async retryFailedSubmissions() {
    const rows = await this.submissionsRepo.find({
      where: [
        { status: RegulatorySubmissionStatus.FAILED, submittedAt: LessThanOrEqual(new Date()) },
        { status: RegulatorySubmissionStatus.PENDING, slsgReference: IsNull() }
      ],
      order: { createdAt: 'ASC' },
      take: 25
    });
    for (const row of rows) {
      const retries = Number((row.payload?.__retryCount as number | undefined) ?? 0);
      if (retries >= 3) continue;
      try {
        const path = this.pathFor(row.submissionType);
        const payload = { ...row.payload };
        delete payload.__retryCount;
        const result = await this.callSlsg(path, payload);
        row.slsgReference = result.reference;
        row.status = RegulatorySubmissionStatus.ACCEPTED;
        row.statusMessage = result.message;
        row.submittedAt = new Date();
      } catch (error) {
        row.status = RegulatorySubmissionStatus.FAILED;
        row.statusMessage =
          error instanceof Error ? error.message : 'SLSG retry failed';
        row.payload = {
          ...row.payload,
          __retryCount: retries + 1
        };
      }
      await this.submissionsRepo.save(row);
    }
  }

  private pathFor(type: RegulatorySubmissionType) {
    if (type === RegulatorySubmissionType.LICENSE_RENEWAL) return '/slsg/v1/licenses/renew';
    if (type === RegulatorySubmissionType.PERIODIC_RETURN) return '/slsg/v1/returns/submit';
    if (type === RegulatorySubmissionType.INCIDENT_REPORT) return '/slsg/v1/incidents/report';
    return '/slsg/v1/attestations/submit';
  }

  private normalizeStatus(status: string) {
    const upper = status.toUpperCase();
    if (upper === 'ACCEPTED' || upper === 'SUCCESS') return RegulatorySubmissionStatus.ACCEPTED;
    if (upper === 'REJECTED') return RegulatorySubmissionStatus.REJECTED;
    if (upper === 'FAILED' || upper === 'ERROR') return RegulatorySubmissionStatus.FAILED;
    return RegulatorySubmissionStatus.PENDING;
  }

  private sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
