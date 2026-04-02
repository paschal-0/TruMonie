import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { randomInt, randomUUID } from 'crypto';
import { Between, In, IsNull, Repository } from 'typeorm';

import { AccountsService } from '../ledger/accounts.service';
import { Currency } from '../ledger/enums/currency.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../risk/audit.service';
import { User } from '../users/entities/user.entity';
import { PTSA_PROVIDER } from './merchant.constants';
import { CreateMerchantDto } from './dto/create-merchant.dto';
import { PosChargeDto } from './dto/pos-charge.dto';
import { RequestPosDto } from './dto/request-pos.dto';
import { MerchantBusinessType, MerchantStatus, Merchant } from './entities/merchant.entity';
import {
  MerchantTransaction,
  MerchantTransactionChannel,
  MerchantTransactionStatus,
  MerchantTransactionType
} from './entities/merchant-transaction.entity';
import { PosTerminal, PosTerminalStatus } from './entities/pos-terminal.entity';
import { Settlement, SettlementCycle, SettlementStatus } from './entities/settlement.entity';
import { PtsaProvider } from './interfaces/ptsa-provider.interface';
import { MerchantErrorCode, MerchantException } from './merchant.errors';

interface PaginationInput {
  page: number;
  perPage: number;
}

interface MerchantListInput extends PaginationInput {
  status?: string;
  query?: string;
}

interface TerminalListInput extends PaginationInput {
  status?: string;
  merchantId?: string;
  query?: string;
}

interface SettlementListInput extends PaginationInput {
  status?: string;
  cycle?: string;
  merchantId?: string;
}

interface TransactionListInput extends PaginationInput {
  status?: string;
  channel?: string;
  merchantId?: string;
}

@Injectable()
export class MerchantService {
  constructor(
    @InjectRepository(Merchant)
    private readonly merchantRepo: Repository<Merchant>,
    @InjectRepository(PosTerminal)
    private readonly terminalRepo: Repository<PosTerminal>,
    @InjectRepository(Settlement)
    private readonly settlementRepo: Repository<Settlement>,
    @InjectRepository(MerchantTransaction)
    private readonly merchantTxRepo: Repository<MerchantTransaction>,
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    @Inject(PTSA_PROVIDER)
    private readonly ptsaProvider: PtsaProvider,
    private readonly accountsService: AccountsService,
    private readonly configService: ConfigService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService
  ) {}

  async create(owner: User, dto: CreateMerchantDto) {
    const existing = await this.merchantRepo.findOne({ where: { ownerUserId: owner.id } });
    if (existing) {
      throw new MerchantException(
        MerchantErrorCode.MERCHANT_ALREADY_REGISTERED,
        'Merchant already registered for this user',
        HttpStatus.CONFLICT
      );
    }

    if (!dto.address?.street || !dto.address?.city || !dto.address?.state) {
      throw new MerchantException(
        MerchantErrorCode.ADDRESS_VERIFICATION_FAILED,
        'Business address verification failed'
      );
    }

    const requiresTin = dto.business_type !== MerchantBusinessType.SOLE_PROPRIETORSHIP;
    if (requiresTin && !dto.tin) {
      throw new MerchantException(
        MerchantErrorCode.INVALID_TIN,
        'TIN is required for corporate merchant types'
      );
    }
    if (dto.tin && !/^[A-Za-z0-9-]{8,20}$/.test(dto.tin)) {
      throw new MerchantException(MerchantErrorCode.INVALID_TIN, 'Invalid TIN format');
    }

    await this.accountsService.ensureUserBaseAccounts(owner.id);
    const wallet = await this.accountsService.findWalletByUserAndCurrency(owner.id, Currency.NGN);
    if (!wallet) {
      throw new MerchantException(
        MerchantErrorCode.MERCHANT_NOT_FOUND,
        'Unable to provision merchant wallet',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const merchant = this.merchantRepo.create({
      ownerUserId: owner.id,
      merchantCode: await this.generateMerchantCode(),
      businessName: dto.business_name.trim(),
      businessType: dto.business_type,
      tin: dto.tin?.trim() || null,
      rcNumber: dto.rc_number?.trim() || null,
      categoryCode: dto.category_code.trim(),
      walletId: wallet.id,
      settlementAccount: dto.settlement_account.trim(),
      settlementBank: dto.settlement_bank.trim(),
      address: {
        street: dto.address.street.trim(),
        city: dto.address.city.trim(),
        state: dto.address.state.trim(),
        country: (dto.address.country ?? 'NG').trim()
      },
      geoLocation: {
        lat: dto.geo_location.lat,
        lng: dto.geo_location.lng
      },
      geoFenceRadius: dto.geo_fence_radius ?? 10,
      settlementCycle: dto.settlement_cycle ?? SettlementCycle.T1,
      status: MerchantStatus.PENDING,
      approvedAt: null,
      approvedBy: null
    });

    const saved = await this.merchantRepo.save(merchant);
    await this.notificationsService.send(
      owner.id,
      'MERCHANT_ONBOARDING_SUBMITTED',
      `Merchant onboarding submitted for ${saved.businessName}. Status: ${saved.status}.`
    );
    await this.auditService.record(owner.id, 'MERCHANT_ONBOARDING_SUBMITTED', {
      merchantId: saved.id,
      merchantCode: saved.merchantCode
    });

    return {
      merchant_id: saved.id,
      status: saved.status,
      wallet_id: saved.walletId,
      merchant_code: saved.merchantCode
    };
  }

  async getMyMerchant(ownerUserId: string) {
    const merchant = await this.findByOwner(ownerUserId);
    if (!merchant) return null;
    return this.toMerchantPayload(merchant);
  }

  async listMyTerminals(ownerUserId: string) {
    const merchant = await this.findByOwner(ownerUserId);
    if (!merchant) return { terminals: [] };

    const terminals = await this.terminalRepo.find({
      where: { merchantId: merchant.id },
      order: { createdAt: 'DESC' }
    });

    return {
      terminals: terminals.map((terminal) => ({
        id: terminal.id,
        terminal_id: terminal.terminalId,
        serial_number: terminal.serialNumber,
        model: terminal.model,
        ptsa_id: terminal.ptsaId,
        geo_location: terminal.geoLocation,
        geo_fence_radius: terminal.geoFenceRadius,
        is_online: terminal.isOnline,
        last_heartbeat: terminal.lastHeartbeat,
        status: terminal.status,
        created_at: terminal.createdAt
      }))
    };
  }

  async listMySettlements(ownerUserId: string, limit: number) {
    const merchant = await this.findByOwner(ownerUserId);
    if (!merchant) return { settlements: [] };

    const rows = await this.settlementRepo.find({
      where: { merchantId: merchant.id },
      order: { settlementDate: 'DESC', createdAt: 'DESC' },
      take: this.normalizeLimit(limit, 30, 200)
    });

    return {
      settlements: rows.map((row) => ({
        id: row.id,
        cycle: row.cycle,
        settlement_date: row.settlementDate,
        total_amount: Number(row.totalAmount),
        total_fee: Number(row.totalFee),
        net_amount: Number(row.netAmount),
        transaction_count: row.transactionCount,
        status: row.status,
        reference: row.reference,
        settled_at: row.settledAt,
        created_at: row.createdAt
      }))
    };
  }

  async listMyTransactions(ownerUserId: string, limit: number) {
    const merchant = await this.findByOwner(ownerUserId);
    if (!merchant) return { transactions: [] };

    const rows = await this.merchantTxRepo.find({
      where: { merchantId: merchant.id },
      order: { postedAt: 'DESC' },
      take: this.normalizeLimit(limit, 50, 200)
    });

    return {
      transactions: rows.map((row) => ({
        id: row.id,
        reference: row.reference,
        amount_minor: Number(row.amountMinor),
        fee_minor: Number(row.feeMinor),
        net_amount_minor: Number(row.netAmountMinor),
        currency: row.currency,
        status: row.status,
        channel: row.channel,
        type: row.type,
        customer_masked_pan: row.customerMaskedPan,
        metadata: row.metadata,
        posted_at: row.postedAt,
        settled_at: row.settledAt,
        created_at: row.createdAt
      }))
    };
  }

  async requestPos(owner: User, dto: RequestPosDto) {
    const merchant = await this.requireMerchantByOwner(owner.id);
    if (merchant.status !== MerchantStatus.APPROVED) {
      throw new MerchantException(
        MerchantErrorCode.MERCHANT_NOT_APPROVED,
        'Merchant is not approved for POS provisioning',
        HttpStatus.FORBIDDEN
      );
    }

    const terminals = Array.from({ length: dto.quantity }).map(() =>
      this.terminalRepo.create({
        merchantId: merchant.id,
        terminalId: this.generateTerminalIdSync(),
        serialNumber: this.generateSerialNumber(),
        model: dto.model?.trim() || null,
        ptsaId: this.configService.get<string>('merchant.defaultPtsaId', 'PTSA_SIM'),
        geoLocation: merchant.geoLocation,
        geoFenceRadius: merchant.geoFenceRadius,
        isOnline: false,
        lastHeartbeat: null,
        status: PosTerminalStatus.PENDING
      })
    );

    await this.terminalRepo.save(terminals);
    await this.notificationsService.send(
      owner.id,
      'MERCHANT_POS_REQUEST_SUBMITTED',
      `POS request submitted: ${dto.quantity} terminal(s).`
    );
    await this.auditService.record(owner.id, 'MERCHANT_POS_REQUEST_SUBMITTED', {
      merchantId: merchant.id,
      quantity: dto.quantity,
      model: dto.model ?? null,
      notes: dto.notes ?? null
    });

    return {
      request_id: randomUUID(),
      status: 'PENDING',
      quantity: dto.quantity,
      terminal_ids: terminals.map((terminal) => terminal.terminalId)
    };
  }
  async chargePos(dto: PosChargeDto) {
    const terminal = await this.terminalRepo.findOne({ where: { terminalId: dto.terminal_id } });
    if (!terminal) {
      throw new MerchantException(MerchantErrorCode.INVALID_TERMINAL_ID, 'Invalid terminal ID');
    }
    if (terminal.status !== PosTerminalStatus.ACTIVE) {
      throw new MerchantException(
        MerchantErrorCode.INVALID_TERMINAL_ID,
        'Terminal is not active',
        HttpStatus.BAD_REQUEST
      );
    }

    const merchant = await this.merchantRepo.findOne({ where: { id: terminal.merchantId } });
    if (!merchant) {
      throw new MerchantException(MerchantErrorCode.MERCHANT_NOT_FOUND, 'Merchant not found');
    }
    if (merchant.status !== MerchantStatus.APPROVED) {
      throw new MerchantException(
        MerchantErrorCode.MERCHANT_NOT_APPROVED,
        'Merchant is not approved for POS charges',
        HttpStatus.FORBIDDEN
      );
    }

    const amountMinor = this.toMinor(dto.amount_minor);
    const offlineMode = this.asBoolean(dto.metadata?.offline);
    if (offlineMode && amountMinor > 10000n) {
      throw new MerchantException(
        MerchantErrorCode.OFFLINE_LIMIT_EXCEEDED,
        'Offline transaction limit exceeded'
      );
    }

    const distanceMeters = this.haversineDistanceMeters(
      this.readGeoPoint(terminal.geoLocation),
      dto.txn_location
    );
    if (distanceMeters > terminal.geoFenceRadius) {
      throw new MerchantException(
        MerchantErrorCode.GEO_FENCE_VIOLATION,
        'Transaction outside terminal geo-fence',
        HttpStatus.FORBIDDEN,
        {
          distance_meters: Number(distanceMeters.toFixed(2)),
          allowed_radius_meters: terminal.geoFenceRadius
        }
      );
    }

    const reference = dto.reference?.trim() || this.generatePosReference();
    const feeMinor = this.calculateFeeMinor(amountMinor);
    const netAmountMinor = amountMinor - feeMinor;
    const currency = dto.currency ?? Currency.NGN;

    let providerResponse;
    try {
      providerResponse = await this.ptsaProvider.charge({
        merchantId: merchant.id,
        merchantCode: merchant.merchantCode,
        terminalId: terminal.terminalId,
        reference,
        amountMinor: amountMinor.toString(),
        currency,
        channel: dto.channel,
        metadata: dto.metadata
      });
    } catch (error) {
      throw new MerchantException(
        MerchantErrorCode.PTSA_ROUTING_FAILED,
        error instanceof Error ? error.message : 'PTSA routing failed',
        HttpStatus.SERVICE_UNAVAILABLE
      );
    }

    const status = this.mapProviderStatus(providerResponse.status);
    const transaction = await this.merchantTxRepo.save(
      this.merchantTxRepo.create({
        merchantId: merchant.id,
        reference,
        amountMinor: amountMinor.toString(),
        feeMinor: feeMinor.toString(),
        netAmountMinor: netAmountMinor.toString(),
        currency,
        status,
        channel: dto.channel,
        type: this.mapTypeForChannel(dto.channel),
        customerMaskedPan: this.readMaskedPan(dto.metadata),
        metadata: {
          ...(dto.metadata ?? {}),
          txn_location: dto.txn_location,
          offline: offlineMode,
          provider: {
            name: this.ptsaProvider.name,
            reference: providerResponse.providerReference,
            response_code: providerResponse.responseCode,
            response_message: providerResponse.responseMessage,
            auth_code: providerResponse.authCode
          }
        },
        settlementId: null,
        settledAt: null,
        postedAt: new Date()
      })
    );

    terminal.isOnline = true;
    terminal.lastHeartbeat = new Date();
    await this.terminalRepo.save(terminal);

    if (status === MerchantTransactionStatus.FAILED) {
      throw new MerchantException(
        MerchantErrorCode.CARD_DECLINED,
        providerResponse.responseMessage ?? 'Card declined',
        HttpStatus.BAD_REQUEST,
        {
          reference,
          provider_reference: providerResponse.providerReference,
          response_code: providerResponse.responseCode
        }
      );
    }

    return {
      transaction_id: transaction.id,
      reference,
      status,
      amount_minor: Number(transaction.amountMinor),
      fee_minor: Number(transaction.feeMinor),
      net_amount_minor: Number(transaction.netAmountMinor),
      currency: transaction.currency,
      provider_reference: providerResponse.providerReference,
      channel: transaction.channel,
      type: transaction.type,
      posted_at: transaction.postedAt
    };
  }

  async processSettlementCycle(cycle: SettlementCycle) {
    try {
      const settlementDate = this.resolveSettlementDate(cycle);
      const [windowStart, windowEnd] = this.resolveSettlementWindow(settlementDate);

      const merchants = await this.merchantRepo.find({
        where: {
          status: MerchantStatus.APPROVED,
          settlementCycle: cycle
        }
      });

      let settlementsCreated = 0;
      let transactionsLinked = 0;
      let skippedExisting = 0;
      let totalAmountMinor = 0n;
      let totalFeeMinor = 0n;
      let totalNetMinor = 0n;

      for (const merchant of merchants) {
        const existing = await this.settlementRepo.findOne({
          where: {
            merchantId: merchant.id,
            cycle,
            settlementDate
          }
        });
        if (existing) {
          skippedExisting += 1;
          continue;
        }

        const txRows = await this.merchantTxRepo.find({
          where: {
            merchantId: merchant.id,
            status: MerchantTransactionStatus.SUCCESS,
            settlementId: IsNull(),
            postedAt: Between(windowStart, windowEnd)
          },
          order: {
            postedAt: 'ASC'
          }
        });

        if (txRows.length === 0) {
          continue;
        }

        const bucketTotal = txRows.reduce((sum, row) => sum + this.toMinor(row.amountMinor), 0n);
        const bucketFee = txRows.reduce((sum, row) => sum + this.toMinor(row.feeMinor), 0n);
        const bucketNet = txRows.reduce((sum, row) => sum + this.toMinor(row.netAmountMinor), 0n);

        const settlement = await this.settlementRepo.save(
          this.settlementRepo.create({
            merchantId: merchant.id,
            cycle,
            settlementDate,
            totalAmount: bucketTotal.toString(),
            totalFee: bucketFee.toString(),
            netAmount: bucketNet.toString(),
            transactionCount: txRows.length,
            status: SettlementStatus.PENDING,
            reference: this.generateSettlementReference(cycle, settlementDate, merchant.merchantCode),
            settledAt: null
          })
        );

        const txIds = txRows.map((row) => row.id);
        await this.merchantTxRepo.update(
          { id: In(txIds) },
          {
            settlementId: settlement.id
          }
        );

        settlementsCreated += 1;
        transactionsLinked += txRows.length;
        totalAmountMinor += bucketTotal;
        totalFeeMinor += bucketFee;
        totalNetMinor += bucketNet;
      }

      return {
        cycle,
        settlement_date: settlementDate,
        merchants_processed: merchants.length,
        settlements_created: settlementsCreated,
        transactions_linked: transactionsLinked,
        skipped_existing: skippedExisting,
        total_amount_minor: Number(totalAmountMinor),
        total_fee_minor: Number(totalFeeMinor),
        total_net_minor: Number(totalNetMinor)
      };
    } catch (error) {
      throw new MerchantException(
        MerchantErrorCode.SETTLEMENT_BATCH_ERROR,
        error instanceof Error ? error.message : 'Settlement processing failed',
        HttpStatus.INTERNAL_SERVER_ERROR
      );
    }
  }

  async adminProcessSettlementCycle(params: {
    adminUserId: string;
    cycle: SettlementCycle;
  }) {
    const result = await this.processSettlementCycle(params.cycle);
    await this.auditService.record(
      params.adminUserId,
      'MERCHANT_SETTLEMENT_PROCESS_TRIGGERED',
      result
    );
    return result;
  }

  async adminOverview() {
    const [
      merchantsTotal,
      merchantsPending,
      merchantsApproved,
      merchantsSuspended,
      terminalsTotal,
      terminalsActive,
      terminalsPending,
      settlementsPending,
      settlementsFailed
    ] = await Promise.all([
      this.merchantRepo.count(),
      this.merchantRepo.count({ where: { status: MerchantStatus.PENDING } }),
      this.merchantRepo.count({ where: { status: MerchantStatus.APPROVED } }),
      this.merchantRepo.count({ where: { status: MerchantStatus.SUSPENDED } }),
      this.terminalRepo.count(),
      this.terminalRepo.count({ where: { status: PosTerminalStatus.ACTIVE } }),
      this.terminalRepo.count({ where: { status: PosTerminalStatus.PENDING } }),
      this.settlementRepo.count({ where: { status: SettlementStatus.PENDING } }),
      this.settlementRepo.count({ where: { status: SettlementStatus.FAILED } })
    ]);

    const [dayStart, dayEnd] = this.resolveDayWindow(new Date());
    const successRows = await this.merchantTxRepo.find({
      where: {
        status: MerchantTransactionStatus.SUCCESS,
        postedAt: Between(dayStart, dayEnd)
      }
    });
    const successVolume = successRows.reduce((sum, row) => sum + this.toMinor(row.amountMinor), 0n);

    return {
      merchants: {
        total: merchantsTotal,
        pending: merchantsPending,
        approved: merchantsApproved,
        suspended: merchantsSuspended
      },
      terminals: {
        total: terminalsTotal,
        active: terminalsActive,
        pending: terminalsPending
      },
      settlements: {
        pending: settlementsPending,
        failed: settlementsFailed
      },
      transactions: {
        success_volume_today_minor: Number(successVolume)
      }
    };
  }
  async adminListMerchants(input: MerchantListInput) {
    const { page, perPage } = this.normalizePagination(input);

    const qb = this.merchantRepo
      .createQueryBuilder('m')
      .leftJoin(User, 'u', 'u.id = m.owner_user_id')
      .select([
        'm.id AS id',
        'm.business_name AS business_name',
        'm.merchant_code AS merchant_code',
        'm.business_type AS business_type',
        'm.category_code AS category_code',
        'm.settlement_bank AS settlement_bank',
        'm.settlement_account AS settlement_account',
        'm.status AS status',
        'm.created_at AS created_at',
        'u.id AS owner_id',
        'u.email AS owner_email',
        'u.phone_number AS owner_phone_number'
      ]);

    const normalizedStatus = this.parseMerchantStatus(input.status);
    if (normalizedStatus) {
      qb.andWhere('m.status = :status', { status: normalizedStatus });
    }

    const search = input.query?.trim();
    if (search) {
      qb.andWhere(
        `(m.business_name ILIKE :q OR m.merchant_code ILIKE :q OR COALESCE(m.tin, '') ILIKE :q OR COALESCE(m.rc_number, '') ILIKE :q OR COALESCE(u.email, '') ILIKE :q OR COALESCE(u.phone_number, '') ILIKE :q)`,
        { q: `%${search}%` }
      );
    }

    const [rows, total] = await Promise.all([
      qb
        .clone()
        .orderBy('m.created_at', 'DESC')
        .offset((page - 1) * perPage)
        .limit(perPage)
        .getRawMany<Record<string, unknown>>(),
      qb.clone().getCount()
    ]);

    return {
      page,
      perPage,
      total,
      items: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        business_name: String(row.business_name),
        merchant_code: String(row.merchant_code),
        business_type: String(row.business_type),
        category_code: String(row.category_code),
        settlement_bank: row.settlement_bank ? String(row.settlement_bank) : null,
        settlement_account: row.settlement_account ? String(row.settlement_account) : null,
        status: String(row.status),
        created_at: row.created_at,
        owner: {
          id: row.owner_id ? String(row.owner_id) : null,
          email: row.owner_email ? String(row.owner_email) : null,
          phoneNumber: row.owner_phone_number ? String(row.owner_phone_number) : null
        }
      }))
    };
  }

  async adminUpdateMerchantStatus(params: {
    adminUserId: string;
    merchantId: string;
    status: MerchantStatus;
    reason?: string;
  }) {
    const merchant = await this.merchantRepo.findOne({ where: { id: params.merchantId } });
    if (!merchant) {
      throw new MerchantException(
        MerchantErrorCode.MERCHANT_NOT_FOUND,
        'Merchant not found',
        HttpStatus.NOT_FOUND
      );
    }

    merchant.status = params.status;
    if (params.status === MerchantStatus.APPROVED) {
      merchant.approvedAt = new Date();
      merchant.approvedBy = params.adminUserId;
    }
    if (params.status === MerchantStatus.REJECTED) {
      merchant.approvedAt = null;
      merchant.approvedBy = null;
    }

    const saved = await this.merchantRepo.save(merchant);
    await this.auditService.record(params.adminUserId, 'MERCHANT_STATUS_UPDATED', {
      merchantId: merchant.id,
      status: params.status,
      reason: params.reason ?? null
    });
    await this.notificationsService.send(
      merchant.ownerUserId,
      'MERCHANT_STATUS_UPDATED',
      `Merchant status updated to ${params.status}${params.reason ? ` (${params.reason})` : ''}.`
    );

    return {
      id: saved.id,
      status: saved.status,
      approved_at: saved.approvedAt,
      approved_by: saved.approvedBy
    };
  }

  async adminListTerminals(input: TerminalListInput) {
    const { page, perPage } = this.normalizePagination(input);

    const qb = this.terminalRepo
      .createQueryBuilder('t')
      .leftJoin(Merchant, 'm', 'm.id = t.merchant_id')
      .select([
        't.id AS id',
        't.terminal_id AS terminal_id',
        't.serial_number AS serial_number',
        't.model AS model',
        't.ptsa_id AS ptsa_id',
        't.status AS status',
        't.is_online AS is_online',
        't.last_heartbeat AS last_heartbeat',
        't.created_at AS created_at',
        'm.id AS merchant_id',
        'm.business_name AS merchant_business_name',
        'm.merchant_code AS merchant_code'
      ]);

    const status = this.parseTerminalStatus(input.status);
    if (status) {
      qb.andWhere('t.status = :status', { status });
    }
    if (input.merchantId) {
      qb.andWhere('t.merchant_id = :merchantId', { merchantId: input.merchantId });
    }
    const query = input.query?.trim();
    if (query) {
      qb.andWhere(
        `(t.terminal_id ILIKE :q OR t.serial_number ILIKE :q OR COALESCE(t.model, '') ILIKE :q OR COALESCE(m.business_name, '') ILIKE :q OR COALESCE(m.merchant_code, '') ILIKE :q)`,
        { q: `%${query}%` }
      );
    }

    const [rows, total] = await Promise.all([
      qb
        .clone()
        .orderBy('t.created_at', 'DESC')
        .offset((page - 1) * perPage)
        .limit(perPage)
        .getRawMany<Record<string, unknown>>(),
      qb.clone().getCount()
    ]);

    return {
      page,
      perPage,
      total,
      items: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        terminal_id: String(row.terminal_id),
        serial_number: String(row.serial_number),
        model: row.model ? String(row.model) : null,
        ptsa_id: String(row.ptsa_id),
        status: String(row.status),
        is_online: Boolean(row.is_online),
        last_heartbeat: row.last_heartbeat,
        created_at: row.created_at,
        merchant: {
          id: row.merchant_id ? String(row.merchant_id) : null,
          business_name: row.merchant_business_name ? String(row.merchant_business_name) : null,
          merchant_code: row.merchant_code ? String(row.merchant_code) : null
        }
      }))
    };
  }

  async adminUpdateTerminalStatus(params: {
    adminUserId: string;
    terminalId: string;
    status: PosTerminalStatus;
  }) {
    const terminal = await this.terminalRepo.findOne({ where: { id: params.terminalId } });
    if (!terminal) {
      throw new MerchantException(
        MerchantErrorCode.INVALID_TERMINAL_ID,
        'Terminal not found',
        HttpStatus.NOT_FOUND
      );
    }

    terminal.status = params.status;
    if (params.status === PosTerminalStatus.ACTIVE) {
      terminal.isOnline = true;
      terminal.lastHeartbeat = new Date();
    }
    if (params.status === PosTerminalStatus.INACTIVE || params.status === PosTerminalStatus.SUSPENDED) {
      terminal.isOnline = false;
    }

    const saved = await this.terminalRepo.save(terminal);
    const merchant = await this.merchantRepo.findOne({ where: { id: terminal.merchantId } });

    await this.auditService.record(params.adminUserId, 'MERCHANT_TERMINAL_STATUS_UPDATED', {
      terminalId: terminal.id,
      status: params.status
    });

    if (merchant) {
      await this.notificationsService.send(
        merchant.ownerUserId,
        'MERCHANT_TERMINAL_STATUS_UPDATED',
        `Terminal ${terminal.terminalId} status updated to ${params.status}.`
      );
    }

    return {
      id: saved.id,
      terminal_id: saved.terminalId,
      status: saved.status,
      is_online: saved.isOnline,
      last_heartbeat: saved.lastHeartbeat
    };
  }

  async adminTerminalHeartbeat(params: { adminUserId: string; terminalId: string }) {
    const terminal = await this.terminalRepo.findOne({ where: { id: params.terminalId } });
    if (!terminal) {
      throw new MerchantException(
        MerchantErrorCode.INVALID_TERMINAL_ID,
        'Terminal not found',
        HttpStatus.NOT_FOUND
      );
    }

    terminal.isOnline = true;
    terminal.lastHeartbeat = new Date();
    const saved = await this.terminalRepo.save(terminal);

    await this.auditService.record(params.adminUserId, 'MERCHANT_TERMINAL_HEARTBEAT', {
      terminalId: terminal.id,
      terminalCode: terminal.terminalId
    });

    return {
      id: saved.id,
      terminal_id: saved.terminalId,
      is_online: saved.isOnline,
      last_heartbeat: saved.lastHeartbeat
    };
  }

  async adminListSettlements(input: SettlementListInput) {
    const { page, perPage } = this.normalizePagination(input);

    const qb = this.settlementRepo
      .createQueryBuilder('s')
      .leftJoin(Merchant, 'm', 'm.id = s.merchant_id')
      .select([
        's.id AS id',
        's.reference AS reference',
        's.cycle AS cycle',
        's.settlement_date AS settlement_date',
        's.total_amount AS total_amount',
        's.total_fee AS total_fee',
        's.net_amount AS net_amount',
        's.transaction_count AS transaction_count',
        's.status AS status',
        's.settled_at AS settled_at',
        's.created_at AS created_at',
        'm.id AS merchant_id',
        'm.business_name AS merchant_business_name',
        'm.merchant_code AS merchant_code'
      ]);

    const status = this.parseSettlementStatus(input.status);
    if (status) {
      qb.andWhere('s.status = :status', { status });
    }
    const cycle = this.parseSettlementCycle(input.cycle);
    if (cycle) {
      qb.andWhere('s.cycle = :cycle', { cycle });
    }
    if (input.merchantId) {
      qb.andWhere('s.merchant_id = :merchantId', { merchantId: input.merchantId });
    }

    const [rows, total] = await Promise.all([
      qb
        .clone()
        .orderBy('s.settlement_date', 'DESC')
        .addOrderBy('s.created_at', 'DESC')
        .offset((page - 1) * perPage)
        .limit(perPage)
        .getRawMany<Record<string, unknown>>(),
      qb.clone().getCount()
    ]);

    return {
      page,
      perPage,
      total,
      items: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        reference: String(row.reference),
        cycle: String(row.cycle),
        settlement_date: String(row.settlement_date),
        total_amount: Number(row.total_amount ?? 0),
        total_fee: Number(row.total_fee ?? 0),
        net_amount: Number(row.net_amount ?? 0),
        transaction_count: Number(row.transaction_count ?? 0),
        status: String(row.status),
        settled_at: row.settled_at,
        created_at: row.created_at,
        merchant: {
          id: row.merchant_id ? String(row.merchant_id) : null,
          business_name: row.merchant_business_name ? String(row.merchant_business_name) : null,
          merchant_code: row.merchant_code ? String(row.merchant_code) : null
        }
      }))
    };
  }

  async adminUpdateSettlementStatus(params: {
    adminUserId: string;
    settlementId: string;
    status: SettlementStatus;
  }) {
    const settlement = await this.settlementRepo.findOne({ where: { id: params.settlementId } });
    if (!settlement) {
      throw new MerchantException(
        MerchantErrorCode.SETTLEMENT_BATCH_ERROR,
        'Settlement not found',
        HttpStatus.NOT_FOUND
      );
    }

    settlement.status = params.status;
    if (params.status === SettlementStatus.SETTLED) {
      settlement.settledAt = new Date();
      await this.merchantTxRepo.update(
        { settlementId: settlement.id },
        { settledAt: settlement.settledAt }
      );
    }
    if (params.status === SettlementStatus.FAILED) {
      settlement.settledAt = null;
    }

    const saved = await this.settlementRepo.save(settlement);
    const merchant = await this.merchantRepo.findOne({ where: { id: settlement.merchantId } });

    await this.auditService.record(params.adminUserId, 'MERCHANT_SETTLEMENT_STATUS_UPDATED', {
      settlementId: settlement.id,
      status: params.status
    });

    if (merchant) {
      await this.notificationsService.send(
        merchant.ownerUserId,
        'MERCHANT_SETTLEMENT_STATUS_UPDATED',
        `Settlement ${settlement.reference} updated to ${params.status}.`
      );
    }

    return {
      id: saved.id,
      reference: saved.reference,
      status: saved.status,
      settled_at: saved.settledAt
    };
  }

  async adminListTransactions(input: TransactionListInput) {
    const { page, perPage } = this.normalizePagination(input);

    const qb = this.merchantTxRepo
      .createQueryBuilder('t')
      .leftJoin(Merchant, 'm', 'm.id = t.merchant_id')
      .select([
        't.id AS id',
        't.reference AS reference',
        't.amount_minor AS amount_minor',
        't.fee_minor AS fee_minor',
        't.net_amount_minor AS net_amount_minor',
        't.currency AS currency',
        't.status AS status',
        't.channel AS channel',
        't.type AS type',
        't.customer_masked_pan AS customer_masked_pan',
        't.posted_at AS posted_at',
        't.settled_at AS settled_at',
        't.created_at AS created_at',
        'm.id AS merchant_id',
        'm.business_name AS merchant_business_name',
        'm.merchant_code AS merchant_code'
      ]);

    const status = this.parseTransactionStatus(input.status);
    if (status) {
      qb.andWhere('t.status = :status', { status });
    }
    const channel = this.parseTransactionChannel(input.channel);
    if (channel) {
      qb.andWhere('t.channel = :channel', { channel });
    }
    if (input.merchantId) {
      qb.andWhere('t.merchant_id = :merchantId', { merchantId: input.merchantId });
    }

    const [rows, total] = await Promise.all([
      qb
        .clone()
        .orderBy('t.posted_at', 'DESC')
        .offset((page - 1) * perPage)
        .limit(perPage)
        .getRawMany<Record<string, unknown>>(),
      qb.clone().getCount()
    ]);

    return {
      page,
      perPage,
      total,
      items: rows.map((row: Record<string, unknown>) => ({
        id: String(row.id),
        reference: String(row.reference),
        amount_minor: Number(row.amount_minor ?? 0),
        fee_minor: Number(row.fee_minor ?? 0),
        net_amount_minor: Number(row.net_amount_minor ?? 0),
        currency: String(row.currency),
        status: String(row.status),
        channel: String(row.channel),
        type: String(row.type),
        customer_masked_pan: row.customer_masked_pan ? String(row.customer_masked_pan) : null,
        posted_at: row.posted_at,
        settled_at: row.settled_at,
        created_at: row.created_at,
        merchant: {
          id: row.merchant_id ? String(row.merchant_id) : null,
          business_name: row.merchant_business_name ? String(row.merchant_business_name) : null,
          merchant_code: row.merchant_code ? String(row.merchant_code) : null
        }
      }))
    };
  }

  async adminGetMerchantDetails(merchantId: string) {
    const merchant = await this.merchantRepo.findOne({ where: { id: merchantId } });
    if (!merchant) {
      throw new MerchantException(
        MerchantErrorCode.MERCHANT_NOT_FOUND,
        'Merchant not found',
        HttpStatus.NOT_FOUND
      );
    }

    const [owner, terminals, settlements, transactions] = await Promise.all([
      this.userRepo.findOne({ where: { id: merchant.ownerUserId } }),
      this.terminalRepo.find({
        where: { merchantId: merchant.id },
        order: { createdAt: 'DESC' },
        take: 50
      }),
      this.settlementRepo.find({
        where: { merchantId: merchant.id },
        order: { settlementDate: 'DESC', createdAt: 'DESC' },
        take: 50
      }),
      this.merchantTxRepo.find({
        where: { merchantId: merchant.id },
        order: { postedAt: 'DESC' },
        take: 100
      })
    ]);

    return {
      merchant: this.toMerchantPayload(merchant),
      owner: owner
        ? {
            id: owner.id,
            firstName: owner.firstName,
            lastName: owner.lastName,
            email: owner.email,
            phoneNumber: owner.phoneNumber
          }
        : null,
      terminals: terminals.map((terminal) => ({
        id: terminal.id,
        terminal_id: terminal.terminalId,
        serial_number: terminal.serialNumber,
        model: terminal.model,
        ptsa_id: terminal.ptsaId,
        geo_location: terminal.geoLocation,
        geo_fence_radius: terminal.geoFenceRadius,
        is_online: terminal.isOnline,
        last_heartbeat: terminal.lastHeartbeat,
        status: terminal.status,
        created_at: terminal.createdAt
      })),
      settlements: settlements.map((row) => ({
        id: row.id,
        reference: row.reference,
        cycle: row.cycle,
        settlement_date: row.settlementDate,
        total_amount: Number(row.totalAmount),
        total_fee: Number(row.totalFee),
        net_amount: Number(row.netAmount),
        transaction_count: row.transactionCount,
        status: row.status,
        settled_at: row.settledAt,
        created_at: row.createdAt
      })),
      transactions: transactions.map((row) => ({
        id: row.id,
        reference: row.reference,
        amount_minor: Number(row.amountMinor),
        fee_minor: Number(row.feeMinor),
        net_amount_minor: Number(row.netAmountMinor),
        currency: row.currency,
        status: row.status,
        channel: row.channel,
        type: row.type,
        customer_masked_pan: row.customerMaskedPan,
        metadata: row.metadata,
        posted_at: row.postedAt,
        settled_at: row.settledAt,
        created_at: row.createdAt
      }))
    };
  }
  private async findByOwner(ownerUserId: string) {
    return this.merchantRepo.findOne({ where: { ownerUserId } });
  }

  private async requireMerchantByOwner(ownerUserId: string) {
    const merchant = await this.findByOwner(ownerUserId);
    if (!merchant) {
      throw new MerchantException(
        MerchantErrorCode.MERCHANT_NOT_FOUND,
        'Merchant profile not found',
        HttpStatus.NOT_FOUND
      );
    }
    return merchant;
  }

  private toMerchantPayload(merchant: Merchant) {
    return {
      id: merchant.id,
      merchant_code: merchant.merchantCode,
      business_name: merchant.businessName,
      business_type: merchant.businessType,
      category_code: merchant.categoryCode,
      tin: merchant.tin,
      rc_number: merchant.rcNumber,
      wallet_id: merchant.walletId,
      settlement_account: merchant.settlementAccount,
      settlement_bank: merchant.settlementBank,
      address: merchant.address,
      geo_location: merchant.geoLocation,
      geo_fence_radius: merchant.geoFenceRadius,
      settlement_cycle: merchant.settlementCycle,
      status: merchant.status,
      approved_at: merchant.approvedAt,
      approved_by: merchant.approvedBy,
      created_at: merchant.createdAt,
      updated_at: merchant.updatedAt
    };
  }

  private normalizeLimit(input: number, fallback: number, max: number) {
    if (!Number.isFinite(input) || input <= 0) return fallback;
    return Math.min(max, Math.max(1, Math.trunc(input)));
  }

  private normalizePagination(input: PaginationInput) {
    const page = Number.isFinite(input.page) && input.page > 0 ? Math.trunc(input.page) : 1;
    const perPage = this.normalizeLimit(input.perPage, 20, 200);
    return { page, perPage };
  }

  private parseMerchantStatus(status?: string): MerchantStatus | undefined {
    if (!status) return undefined;
    const candidate = status.toUpperCase() as MerchantStatus;
    return Object.values(MerchantStatus).includes(candidate) ? candidate : undefined;
  }

  private parseTerminalStatus(status?: string): PosTerminalStatus | undefined {
    if (!status) return undefined;
    const candidate = status.toUpperCase() as PosTerminalStatus;
    return Object.values(PosTerminalStatus).includes(candidate) ? candidate : undefined;
  }

  private parseSettlementStatus(status?: string): SettlementStatus | undefined {
    if (!status) return undefined;
    const candidate = status.toUpperCase() as SettlementStatus;
    return Object.values(SettlementStatus).includes(candidate) ? candidate : undefined;
  }

  private parseSettlementCycle(cycle?: string): SettlementCycle | undefined {
    if (!cycle) return undefined;
    const candidate = cycle.toUpperCase() as SettlementCycle;
    return Object.values(SettlementCycle).includes(candidate) ? candidate : undefined;
  }

  private parseTransactionStatus(status?: string): MerchantTransactionStatus | undefined {
    if (!status) return undefined;
    const candidate = status.toUpperCase() as MerchantTransactionStatus;
    return Object.values(MerchantTransactionStatus).includes(candidate) ? candidate : undefined;
  }

  private parseTransactionChannel(channel?: string): MerchantTransactionChannel | undefined {
    if (!channel) return undefined;
    const candidate = channel.toUpperCase() as MerchantTransactionChannel;
    return Object.values(MerchantTransactionChannel).includes(candidate) ? candidate : undefined;
  }

  private mapProviderStatus(status: 'PENDING' | 'SUCCESS' | 'FAILED') {
    if (status === 'SUCCESS') return MerchantTransactionStatus.SUCCESS;
    if (status === 'FAILED') return MerchantTransactionStatus.FAILED;
    return MerchantTransactionStatus.PENDING;
  }

  private mapTypeForChannel(channel: MerchantTransactionChannel) {
    if (channel === MerchantTransactionChannel.CARD) return MerchantTransactionType.CARD_PAYMENT;
    if (channel === MerchantTransactionChannel.QR) return MerchantTransactionType.QR_PAYMENT;
    return MerchantTransactionType.TRANSFER_PAYMENT;
  }

  private calculateFeeMinor(amountMinor: bigint) {
    const bps = this.configService.get<number>('merchant.posFeeBps', 100);
    const normalizedBps = Number.isFinite(bps) && bps >= 0 ? Math.trunc(bps) : 0;
    return (amountMinor * BigInt(normalizedBps)) / 10000n;
  }

  private toMinor(value: string | number | bigint) {
    if (typeof value === 'bigint') return value;
    if (typeof value === 'number') return BigInt(Math.trunc(value));
    return BigInt(String(value));
  }

  private asBoolean(value: unknown) {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      return normalized === '1' || normalized === 'true' || normalized === 'yes';
    }
    return false;
  }

  private readMaskedPan(metadata?: Record<string, unknown>) {
    const candidate = metadata?.masked_pan ?? metadata?.maskedPan;
    return typeof candidate === 'string' ? candidate : null;
  }

  private readGeoPoint(geoLocation: Record<string, unknown>) {
    const latRaw = geoLocation.lat;
    const lngRaw = geoLocation.lng;
    const lat = typeof latRaw === 'number' ? latRaw : Number(latRaw);
    const lng = typeof lngRaw === 'number' ? lngRaw : Number(lngRaw);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      throw new MerchantException(
        MerchantErrorCode.GEO_FENCE_VIOLATION,
        'Terminal geo-location is invalid',
        HttpStatus.FORBIDDEN
      );
    }
    return { lat, lng };
  }

  private haversineDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
    const toRad = (value: number) => (value * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const sinDlat = Math.sin(dLat / 2);
    const sinDlng = Math.sin(dLng / 2);

    const c =
      2 *
      Math.atan2(
        Math.sqrt(sinDlat * sinDlat + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDlng * sinDlng),
        Math.sqrt(
          1 -
            (sinDlat * sinDlat +
              Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinDlng * sinDlng)
        )
      );

    const meters = 6371000 * c;
    return Number.isFinite(meters) ? meters : Number.MAX_SAFE_INTEGER;
  }

  private resolveSettlementDate(cycle: SettlementCycle) {
    const now = new Date();
    if (cycle === SettlementCycle.T0) {
      return this.toIsoDate(now);
    }
    const prior = new Date(now);
    prior.setDate(now.getDate() - 1);
    return this.toIsoDate(prior);
  }

  private resolveSettlementWindow(settlementDate: string): [Date, Date] {
    const start = new Date(`${settlementDate}T00:00:00.000Z`);
    const end = new Date(`${settlementDate}T23:59:59.999Z`);
    return [start, end];
  }

  private resolveDayWindow(date: Date): [Date, Date] {
    const day = this.toIsoDate(date);
    return this.resolveSettlementWindow(day);
  }

  private toIsoDate(date: Date) {
    return date.toISOString().slice(0, 10);
  }

  private async generateMerchantCode() {
    const datePart = this.toIsoDate(new Date()).replace(/-/g, '');
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const suffix = randomInt(100, 999);
      const code = `MRC-${datePart}-${suffix}`;
      const exists = await this.merchantRepo.findOne({ where: { merchantCode: code } });
      if (!exists) return code;
    }
    return `MRC-${datePart}-${randomUUID().slice(0, 6).toUpperCase()}`;
  }

  private generateTerminalIdSync() {
    return `${randomInt(10_000_000, 99_999_999)}`;
  }

  private generateSerialNumber() {
    return `TM-SN-${Date.now()}-${randomInt(100, 999)}`;
  }

  private generatePosReference() {
    return `POS-${Date.now()}-${randomInt(1000, 9999)}`;
  }

  private generateSettlementReference(cycle: SettlementCycle, settlementDate: string, merchantCode: string) {
    const day = settlementDate.replace(/-/g, '');
    const suffix = randomInt(1000, 9999);
    return `STL-${cycle}-${day}-${merchantCode}-${suffix}`;
  }
}
