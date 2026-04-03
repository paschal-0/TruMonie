import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { SystemConfig } from './entities/system-config.entity';
import { AdminErrorCode, AdminException } from './admin.errors';

@Injectable()
export class SystemConfigService {
  constructor(
    @InjectRepository(SystemConfig)
    private readonly configRepo: Repository<SystemConfig>
  ) {}

  async list(configKey?: string) {
    const qb = this.configRepo.createQueryBuilder('cfg').orderBy('cfg.createdAt', 'DESC');
    if (configKey) qb.andWhere('cfg.configKey = :configKey', { configKey });
    const rows = await qb.getMany();
    return rows.map((row) => this.toPayload(row));
  }

  async getActive(configKey: string) {
    const row = await this.configRepo.findOne({
      where: {
        configKey,
        isActive: true
      },
      order: { version: 'DESC' }
    });
    return row ? this.toPayload(row) : null;
  }

  async createDraft(params: {
    configKey: string;
    configValue: Record<string, unknown>;
    description?: string;
    changedBy: string;
  }) {
    this.validateValue(params.configKey, params.configValue);
    const latest = await this.configRepo.findOne({
      where: { configKey: params.configKey },
      order: { version: 'DESC' }
    });
    const version = (latest?.version ?? 0) + 1;
    const draft = this.configRepo.create({
      configKey: params.configKey,
      configValue: params.configValue,
      description: params.description?.trim() || null,
      changedBy: params.changedBy,
      approvedBy: null,
      version,
      isActive: false
    });
    return this.toPayload(await this.configRepo.save(draft));
  }

  async activate(configId: string, approvedBy: string) {
    const target = await this.configRepo.findOne({ where: { id: configId } });
    if (!target) return null;

    await this.configRepo.update(
      {
        configKey: target.configKey,
        isActive: true
      },
      { isActive: false }
    );
    target.isActive = true;
    target.approvedBy = approvedBy;
    await this.configRepo.save(target);
    return this.toPayload(target);
  }

  async rollback(configKey: string, approvedBy: string) {
    const versions = await this.configRepo.find({
      where: { configKey },
      order: { version: 'DESC' },
      take: 2
    });
    if (versions.length < 2) {
      throw new AdminException(
        AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE,
        `No previous version available for ${configKey}`
      );
    }
    const previous = versions[1];
    return this.activate(previous.id, approvedBy);
  }

  private toPayload(row: SystemConfig) {
    return {
      id: row.id,
      config_key: row.configKey,
      config_value: row.configValue,
      description: row.description,
      changed_by: row.changedBy,
      approved_by: row.approvedBy,
      version: row.version,
      is_active: row.isActive,
      created_at: row.createdAt,
      updated_at: row.updatedAt
    };
  }

  private validateValue(configKey: string, configValue: Record<string, unknown>) {
    if (!configKey?.trim()) {
      throw new AdminException(
        AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE,
        'config_key is required'
      );
    }
    const key = configKey.trim().toLowerCase();
    const numericKeys = new Set([
      'tier_1_daily_limit',
      'tier_2_daily_limit',
      'new_device_circuit_breaker_hours',
      'nip_retry_max_attempts',
      'agent_daily_cashout_limit'
    ]);
    if (numericKeys.has(key)) {
      const value = configValue.value ?? configValue.amount ?? configValue.limit;
      const numeric = typeof value === 'number' ? value : Number(value);
      if (!Number.isFinite(numeric) || numeric <= 0) {
        throw new AdminException(
          AdminErrorCode.INVALID_SYSTEM_CONFIG_VALUE,
          `Invalid numeric value for ${configKey}`
        );
      }
    }
  }
}
