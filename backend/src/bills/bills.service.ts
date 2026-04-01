import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { LimitsService } from '../limits/limits.service';
import { AccountsService } from '../ledger/accounts.service';
import { LedgerService } from '../ledger/ledger.service';
import { Currency } from '../ledger/enums/currency.enum';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { SystemAccountsConfig } from '../config/configuration';
import { UsersService } from '../users/users.service';
import { BillErrorCode, BillException } from './bills.errors';
import { BillBeneficiary } from './entities/bill-beneficiary.entity';
import { BillPayment, BillStatus } from './entities/bill-payment.entity';
import { BillValidation, BillValidationStatus } from './entities/bill-validation.entity';
import { SaveBeneficiaryDto } from './dto/save-beneficiary.dto';
import {
  BillCategoryDefinition,
  BillerDefinition,
  BillsProvider
} from './interfaces/bills-provider.interface';
import { REDIS_CLIENT } from '../redis/redis.module';
import { BILLS_PROVIDER } from './bills.constants';

interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<void>;
}

interface PayBillParams {
  userId: string;
  walletId: string;
  billerId: string;
  validationRef?: string;
  customerRef?: string;
  amountMinor: string;
  currency: Currency;
  idempotencyKey: string;
  description?: string;
  systemAccounts: SystemAccountsConfig;
}

interface PayNqrParams {
  userId: string;
  walletId: string;
  qrData: string;
  amountMinor: string;
  currency: Currency;
  idempotencyKey: string;
  systemAccounts: SystemAccountsConfig;
}

@Injectable()
export class BillsService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
    private readonly usersService: UsersService,
    private readonly limitsService: LimitsService,
    @Inject(BILLS_PROVIDER) private readonly billsProvider: BillsProvider,
    @InjectRepository(BillPayment)
    private readonly billRepo: Repository<BillPayment>,
    @InjectRepository(BillValidation)
    private readonly billValidationRepo: Repository<BillValidation>,
    @InjectRepository(BillBeneficiary)
    private readonly beneRepo: Repository<BillBeneficiary>,
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClient
  ) {}

  async categories() {
    const categories = await this.listCategoriesCached();
    return {
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        billers: category.billers.map((biller) => ({
          id: biller.id,
          name: biller.name,
          requires_validation: biller.requiresValidation,
          validation_fields: biller.validationFields,
          amount_type: biller.amountType,
          amount_minor: biller.amountMinor ?? null
        }))
      }))
    };
  }

  async catalog() {
    const categories = await this.listCategoriesCached();
    return categories.flatMap((category) =>
      category.billers.map((biller) => ({
        code: biller.id,
        name: biller.name,
        category: category.id,
        amountType: biller.amountType,
        amountMinor: biller.amountMinor
      }))
    );
  }

  async validateBill(params: {
    userId: string;
    billerId: string;
    fields: Record<string, string>;
  }) {
    const biller = await this.resolveBiller(params.billerId);
    const normalizedFields = this.normalizeFields(params.fields);
    this.assertValidationFields(biller, normalizedFields);
    const customerRef = this.pickCustomerRef(biller, normalizedFields);
    this.assertCustomerRef(customerRef);

    const validationReference = this.reference('BVAL');
    const providerResult =
      this.billsProvider.validate && biller.requiresValidation
        ? await this.executeWithProviderGuard(() =>
            this.billsProvider.validate!({
              billerId: biller.id,
              fields: normalizedFields,
              reference: validationReference
            })
          )
        : {
            customerName: 'VALIDATED CUSTOMER',
            customerAddress: null,
            customerRef,
            outstandingBalanceMinor: '0',
            minimumAmountMinor: biller.amountType === 'fixed' && biller.amountMinor
              ? biller.amountMinor.toString()
              : '0',
            validUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
            metadata: { bypassValidation: true }
          };

    const validUntil =
      providerResult?.validUntil && !Number.isNaN(Date.parse(providerResult.validUntil))
        ? new Date(providerResult.validUntil)
        : new Date(Date.now() + 10 * 60 * 1000);

    const saved = await this.billValidationRepo.save(
      this.billValidationRepo.create({
        userId: params.userId,
        walletId: null,
        billerId: biller.id,
        category: biller.category,
        provider: this.billsProvider.name,
        requestFields: normalizedFields,
        customerName: providerResult?.customerName ?? null,
        customerAddress: providerResult?.customerAddress ?? null,
        customerRef: providerResult?.customerRef ?? customerRef,
        outstandingBalanceMinor: providerResult?.outstandingBalanceMinor ?? '0',
        minimumAmountMinor: providerResult?.minimumAmountMinor ?? '0',
        status: BillValidationStatus.PENDING,
        metadata: providerResult?.metadata ?? null,
        expiresAt: validUntil,
        usedAt: null
      })
    );

    return {
      validation_ref: saved.id,
      customer_name: saved.customerName,
      customer_address: saved.customerAddress,
      customer_ref: saved.customerRef,
      outstanding_balance: Number(saved.outstandingBalanceMinor),
      minimum_amount: Number(saved.minimumAmountMinor),
      valid_until: saved.expiresAt.toISOString()
    };
  }

  async payBill(params: PayBillParams) {
    const existing = await this.billRepo.findOne({
      where: { idempotencyKey: params.idempotencyKey, userId: params.userId }
    });
    if (existing) {
      return this.toPaymentResponse(existing);
    }

    const wallet = await this.accountsService.findById(params.walletId);
    if (!wallet || wallet.userId !== params.userId) {
      throw new NotFoundException('Wallet not found');
    }
    if (wallet.currency !== params.currency) {
      throw new BadRequestException('Wallet currency mismatch');
    }
    if (BigInt(params.amountMinor) <= 0n) {
      throw new BadRequestException('amount must be greater than zero');
    }

    const user = await this.usersService.findById(params.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const biller = await this.resolveBiller(params.billerId);
    const validation = await this.resolveValidation(params.userId, biller, params.validationRef);
    const minimumAmountMinor =
      validation?.minimumAmountMinor ??
      (biller.amountType === 'fixed' && biller.amountMinor ? biller.amountMinor.toString() : '0');
    if (BigInt(params.amountMinor) < BigInt(minimumAmountMinor)) {
      throw new BillException(
        BillErrorCode.AMOUNT_BELOW_MINIMUM,
        'Amount below biller minimum',
        HttpStatus.BAD_REQUEST
      );
    }

    const feeMinor = this.computeFeeMinor(biller.category, params.amountMinor);
    const totalDebitMinor = (BigInt(params.amountMinor) + BigInt(feeMinor)).toString();
    await this.limitsService.assertWithinLimits(
      params.userId,
      user.limitTier,
      totalDebitMinor,
      params.currency
    );

    const reference = this.reference('BIL');
    const beneficiary = validation?.customerRef ?? params.customerRef ?? '';
    if (!beneficiary) {
      throw new BillException(
        BillErrorCode.INVALID_CUSTOMER_REF,
        'Customer reference is required',
        HttpStatus.BAD_REQUEST
      );
    }
    this.assertCustomerRef(beneficiary);

    const payment = this.billRepo.create({
      reference,
      userId: params.userId,
      walletId: wallet.id,
      sourceAccountId: wallet.id,
      billerId: biller.id,
      category: biller.category,
      validationRef: validation?.id ?? null,
      customerName: validation?.customerName ?? null,
      customerRef: beneficiary,
      currency: params.currency,
      amountMinor: params.amountMinor,
      feeMinor,
      token: null,
      units: null,
      aggregator: biller.aggregator ?? this.billsProvider.name,
      aggregatorRef: null,
      idempotencyKey: params.idempotencyKey,
      completedAt: null,
      sessionId: null,
      receipt: null,
      provider: this.billsProvider.name,
      providerReference: reference,
      status: BillStatus.PENDING,
      request: {
        billerId: biller.id,
        beneficiary,
        amountMinor: params.amountMinor,
        feeMinor,
        description: params.description ?? null
      },
      response: null
    });
    await this.billRepo.save(payment);

    const treasuryAccountId = this.resolveTreasuryAccount(params.systemAccounts, params.currency);
    const feesAccountId = this.resolveFeesAccount(params.systemAccounts, params.currency);

    try {
      await this.ledgerService.postEntry({
        reference: `BILL-DEBIT-${reference}`,
        idempotencyKey: `BILL-DEBIT-${params.idempotencyKey}`,
        description: params.description ?? `Bill payment ${biller.name}`,
        enforceNonNegative: true,
        metadata: {
          category: 'BILL_PAYMENT',
          channel: 'BILLS',
          billerId: biller.id
        },
        lines: [
          {
            accountId: wallet.id,
            direction: EntryDirection.DEBIT,
            amountMinor: totalDebitMinor,
            currency: params.currency,
            category: 'BILL_PAYMENT',
            channel: 'BILLS',
            feeMinor
          },
          {
            accountId: treasuryAccountId,
            direction: EntryDirection.CREDIT,
            amountMinor: params.amountMinor,
            currency: params.currency,
            category: 'BILL_PAYMENT',
            channel: 'BILLS'
          },
          ...(BigInt(feeMinor) > 0n
            ? [
                {
                  accountId: feesAccountId,
                  direction: EntryDirection.CREDIT,
                  amountMinor: feeMinor,
                  currency: params.currency,
                  category: 'FEE',
                  channel: 'BILLS'
                }
              ]
            : [])
        ]
      });
    } catch (error) {
      throw this.wrapDebitError(error);
    }

    try {
      const providerRes = await this.executeWithProviderGuard(() =>
        this.billsProvider.purchase({
          productCode: biller.id,
          beneficiary,
          amountMinor: params.amountMinor,
          currency: params.currency,
          reference,
          validationRef: validation?.id,
          customerName: validation?.customerName ?? undefined,
          customerRef: beneficiary
        })
      );

      payment.providerReference = providerRes.providerReference;
      payment.aggregatorRef = providerRes.billerReference ?? providerRes.providerReference;
      payment.token = providerRes.token ?? null;
      payment.units = providerRes.units ?? null;
      payment.response =
        providerRes.metadata ??
        (providerRes as unknown as Record<string, unknown>);
      if (
        providerRes.status === 'SUCCESS' &&
        biller.category === 'electricity' &&
        !providerRes.token
      ) {
        throw new BillException(
          BillErrorCode.TOKEN_GENERATION_FAILED,
          'Token generation failed',
          HttpStatus.UNPROCESSABLE_ENTITY
        );
      }
      payment.status =
        providerRes.status === 'SUCCESS'
          ? BillStatus.SUCCESS
          : providerRes.status === 'FAILED'
          ? BillStatus.FAILED
          : BillStatus.PENDING;

      if (payment.status === BillStatus.FAILED) {
        await this.reverseBillDebit(payment, params.systemAccounts);
      }
      if (payment.status === BillStatus.SUCCESS) {
        payment.completedAt = new Date();
      }
      payment.receipt = this.buildReceiptPayload(payment, {
        customerName: validation?.customerName ?? null
      });
      await this.billRepo.save(payment);

      if (validation) {
        validation.status = BillValidationStatus.USED;
        validation.usedAt = new Date();
        validation.walletId = wallet.id;
        await this.billValidationRepo.save(validation);
      }
      await this.markBeneficiaryUsed(params.userId, biller.id, beneficiary);

      return this.toPaymentResponse(payment);
    } catch (error) {
      await this.reverseBillDebit(payment, params.systemAccounts);
      payment.status = BillStatus.FAILED;
      payment.response = {
        error: this.extractErrorMessage(error)
      };
      await this.billRepo.save(payment);
      throw this.wrapProviderError(error);
    }
  }

  async payNqr(params: PayNqrParams) {
    const existing = await this.billRepo.findOne({
      where: { idempotencyKey: params.idempotencyKey, userId: params.userId }
    });
    if (existing) {
      return this.toNqrResponse(existing);
    }

    const wallet = await this.accountsService.findById(params.walletId);
    if (!wallet || wallet.userId !== params.userId) {
      throw new NotFoundException('Wallet not found');
    }
    if (params.currency !== Currency.NGN) {
      throw new BadRequestException('NQR payments currently support NGN only');
    }
    if (!this.isLikelyQrPayload(params.qrData)) {
      throw new BillException(BillErrorCode.INVALID_QR, 'Invalid QR code format');
    }

    const user = await this.usersService.findById(params.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }
    await this.limitsService.assertWithinLimits(
      params.userId,
      user.limitTier,
      params.amountMinor,
      params.currency
    );

    const reference = this.reference('NQR');
    const treasuryAccountId = this.resolveTreasuryAccount(params.systemAccounts, params.currency);
    const payment = await this.billRepo.save(
      this.billRepo.create({
        reference,
        userId: params.userId,
        walletId: wallet.id,
        sourceAccountId: wallet.id,
        billerId: 'NQR',
        category: 'nqr',
        validationRef: null,
        customerName: null,
        customerRef: params.qrData.slice(0, 120),
        currency: params.currency,
        amountMinor: params.amountMinor,
        feeMinor: '0',
        token: null,
        units: null,
        aggregator: this.billsProvider.name,
        aggregatorRef: null,
        idempotencyKey: params.idempotencyKey,
        completedAt: null,
        sessionId: null,
        receipt: null,
        provider: this.billsProvider.name,
        providerReference: reference,
        status: BillStatus.PENDING,
        request: { qrData: params.qrData, amountMinor: params.amountMinor },
        response: null
      })
    );

    try {
      await this.ledgerService.postEntry({
        reference: `NQR-DEBIT-${reference}`,
        idempotencyKey: `NQR-DEBIT-${params.idempotencyKey}`,
        description: 'NQR merchant payment',
        enforceNonNegative: true,
        metadata: {
          category: 'NQR_PAYMENT',
          channel: 'NQR'
        },
        lines: [
          {
            accountId: wallet.id,
            direction: EntryDirection.DEBIT,
            amountMinor: params.amountMinor,
            currency: params.currency,
            category: 'NQR_PAYMENT',
            channel: 'NQR'
          },
          {
            accountId: treasuryAccountId,
            direction: EntryDirection.CREDIT,
            amountMinor: params.amountMinor,
            currency: params.currency,
            category: 'NQR_PAYMENT',
            channel: 'NQR'
          }
        ]
      });
    } catch (error) {
      throw this.wrapDebitError(error);
    }

    try {
      const nqrRes = this.billsProvider.payNqr
        ? await this.executeWithProviderGuard(() =>
            this.billsProvider.payNqr!({
              qrData: params.qrData,
              amountMinor: params.amountMinor,
              currency: params.currency,
              reference
            })
          )
        : {
            status: 'SUCCESS' as const,
            providerReference: `NQR-${Date.now()}`,
            sessionId: this.generateSessionId(),
            merchantName: 'NQR MERCHANT'
          };

      payment.status =
        nqrRes.status === 'SUCCESS'
          ? BillStatus.SUCCESS
          : nqrRes.status === 'FAILED'
          ? BillStatus.FAILED
          : BillStatus.PENDING;
      payment.providerReference = nqrRes.providerReference;
      payment.aggregatorRef = nqrRes.providerReference;
      payment.sessionId = nqrRes.sessionId ?? null;
      payment.customerName = nqrRes.merchantName ?? null;
      payment.response = nqrRes.metadata ?? (nqrRes as unknown as Record<string, unknown>);
      if (payment.status === BillStatus.FAILED) {
        await this.reverseNqrDebit(payment, params.systemAccounts);
      } else if (payment.status === BillStatus.SUCCESS) {
        payment.completedAt = new Date();
      }
      await this.billRepo.save(payment);
      return this.toNqrResponse(payment);
    } catch (error) {
      await this.reverseNqrDebit(payment, params.systemAccounts);
      payment.status = BillStatus.FAILED;
      payment.response = {
        error: this.extractErrorMessage(error)
      };
      await this.billRepo.save(payment);
      throw this.wrapProviderError(error);
    }
  }

  async saveBeneficiary(userId: string, dto: SaveBeneficiaryDto) {
    const existing = await this.beneRepo.findOne({
      where: {
        userId,
        productCode: dto.productCode,
        destination: dto.destination,
        deletedAt: IsNull()
      }
    });
    if (existing) {
      existing.nickname = dto.nickname;
      return this.beneRepo.save(existing);
    }
    const bene = this.beneRepo.create({
      userId,
      productCode: dto.productCode,
      destination: dto.destination,
      nickname: dto.nickname,
      lastUsedAt: null,
      deletedAt: null
    });
    return this.beneRepo.save(bene);
  }

  async listBeneficiaries(userId: string) {
    const beneficiaries = await this.beneRepo.find({
      where: { userId, deletedAt: IsNull() },
      order: { lastUsedAt: 'DESC', createdAt: 'DESC' }
    });
    return {
      beneficiaries
    };
  }

  async deleteBeneficiary(userId: string, beneficiaryId: string) {
    const existing = await this.beneRepo.findOne({
      where: { id: beneficiaryId, userId, deletedAt: IsNull() }
    });
    if (!existing) {
      throw new NotFoundException('Beneficiary not found');
    }
    existing.deletedAt = new Date();
    await this.beneRepo.save(existing);
    return { success: true };
  }

  private async resolveBiller(billerIdRaw: string) {
    const categories = await this.listCategoriesCached();
    const normalizedId = this.normalizeBillerId(billerIdRaw);
    for (const category of categories) {
      for (const biller of category.billers) {
        if (this.normalizeBillerId(biller.id) === normalizedId) {
          return {
            ...biller,
            category: category.id
          };
        }
      }
    }
    throw new BadRequestException(`Unsupported biller_id "${billerIdRaw}"`);
  }

  private async resolveValidation(
    userId: string,
    biller: BillerDefinition & { category: string },
    validationRef?: string
  ) {
    if (!biller.requiresValidation) {
      return null;
    }
    if (!validationRef) {
      throw new BillException(
        BillErrorCode.VALIDATION_EXPIRED,
        'Validation reference is required. Re-validate first.'
      );
    }

    const validation = await this.billValidationRepo.findOne({
      where: {
        id: validationRef,
        userId,
        status: BillValidationStatus.PENDING
      }
    });
    if (!validation) {
      throw new BillException(
        BillErrorCode.VALIDATION_EXPIRED,
        'Validation expired - re-validate'
      );
    }
    if (validation.billerId !== biller.id) {
      throw new BillException(
        BillErrorCode.VALIDATION_EXPIRED,
        'Validation reference does not match selected biller'
      );
    }
    if (validation.expiresAt.getTime() < Date.now()) {
      validation.status = BillValidationStatus.EXPIRED;
      await this.billValidationRepo.save(validation);
      throw new BillException(
        BillErrorCode.VALIDATION_EXPIRED,
        'Validation expired - re-validate'
      );
    }
    return validation;
  }

  private async reverseBillDebit(payment: BillPayment, systemAccounts: SystemAccountsConfig) {
    if (payment.status === BillStatus.FAILED) return;
    const treasuryAccountId = this.resolveTreasuryAccount(systemAccounts, payment.currency);
    const feesAccountId = this.resolveFeesAccount(systemAccounts, payment.currency);
    const totalCredit = (BigInt(payment.amountMinor) + BigInt(payment.feeMinor ?? '0')).toString();
    await this.ledgerService.postEntry({
      reference: `BILL-REV-${payment.reference ?? payment.id}`,
      idempotencyKey: `BILL-REV-${payment.idempotencyKey ?? payment.id}`,
      description: `Bill reversal ${payment.reference ?? payment.id}`,
      enforceNonNegative: true,
      metadata: {
        category: 'REVERSAL',
        channel: 'BILLS'
      },
      lines: [
        {
          accountId: treasuryAccountId,
          direction: EntryDirection.DEBIT,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          category: 'REVERSAL',
          channel: 'BILLS'
        },
        {
          accountId: payment.walletId ?? payment.sourceAccountId,
          direction: EntryDirection.CREDIT,
          amountMinor: totalCredit,
          currency: payment.currency,
          category: 'REVERSAL',
          channel: 'BILLS',
          feeMinor: payment.feeMinor
        },
        ...(BigInt(payment.feeMinor ?? '0') > 0n
          ? [
              {
                accountId: feesAccountId,
                direction: EntryDirection.DEBIT,
                amountMinor: payment.feeMinor,
                currency: payment.currency,
                category: 'REVERSAL',
                channel: 'BILLS'
              }
            ]
          : [])
      ]
    });
  }

  private async reverseNqrDebit(payment: BillPayment, systemAccounts: SystemAccountsConfig) {
    if (payment.status === BillStatus.FAILED) return;
    const treasuryAccountId = this.resolveTreasuryAccount(systemAccounts, payment.currency);
    await this.ledgerService.postEntry({
      reference: `NQR-REV-${payment.reference ?? payment.id}`,
      idempotencyKey: `NQR-REV-${payment.idempotencyKey ?? payment.id}`,
      description: `NQR reversal ${payment.reference ?? payment.id}`,
      enforceNonNegative: true,
      metadata: {
        category: 'REVERSAL',
        channel: 'NQR'
      },
      lines: [
        {
          accountId: treasuryAccountId,
          direction: EntryDirection.DEBIT,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          category: 'REVERSAL',
          channel: 'NQR'
        },
        {
          accountId: payment.walletId ?? payment.sourceAccountId,
          direction: EntryDirection.CREDIT,
          amountMinor: payment.amountMinor,
          currency: payment.currency,
          category: 'REVERSAL',
          channel: 'NQR'
        }
      ]
    });
  }

  private toPaymentResponse(payment: BillPayment) {
    const timestamp = payment.completedAt ?? payment.updatedAt;
    return {
      payment_id: payment.id,
      reference: payment.reference ?? payment.id,
      status: payment.status,
      amount: Number(payment.amountMinor),
      fee: Number(payment.feeMinor ?? '0'),
      token: payment.token,
      units: payment.units,
      biller_reference: payment.aggregatorRef ?? payment.providerReference,
      receipt:
        payment.receipt ??
        this.buildReceiptPayload(payment, {
          customerName: payment.customerName
        }),
      timestamp: timestamp.toISOString()
    };
  }

  private toNqrResponse(payment: BillPayment) {
    return {
      payment_id: payment.id,
      merchant_name: payment.customerName ?? 'NQR MERCHANT',
      amount: Number(payment.amountMinor),
      status: payment.status,
      session_id: payment.sessionId
    };
  }

  private buildReceiptPayload(
    payment: BillPayment,
    options: { customerName?: string | null }
  ): Record<string, unknown> {
    const timestamp = payment.completedAt ?? payment.updatedAt;
    return {
      customer_name: options.customerName ?? payment.customerName,
      customer_ref: payment.customerRef,
      amount: this.formatMoney(payment.amountMinor, payment.currency),
      fee: this.formatMoney(payment.feeMinor ?? '0', payment.currency),
      token: payment.token,
      units: payment.units,
      timestamp: timestamp.toISOString()
    };
  }

  private formatMoney(amountMinor: string, currency: Currency): string {
    const value = Number(amountMinor) / 100;
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(value);
  }

  private async markBeneficiaryUsed(userId: string, productCode: string, destination: string) {
    const existing = await this.beneRepo.findOne({
      where: {
        userId,
        productCode,
        destination,
        deletedAt: IsNull()
      }
    });
    if (!existing) return;
    existing.lastUsedAt = new Date();
    await this.beneRepo.save(existing);
  }

  private resolveTreasuryAccount(systemAccounts: SystemAccountsConfig, currency: Currency) {
    const treasuryAccountId = systemAccounts.treasury[currency];
    if (!treasuryAccountId) {
      throw new BadRequestException('Treasury account not configured for bills');
    }
    return treasuryAccountId;
  }

  private resolveFeesAccount(systemAccounts: SystemAccountsConfig, currency: Currency) {
    return systemAccounts.fees[currency] ?? this.resolveTreasuryAccount(systemAccounts, currency);
  }

  private async listCategoriesCached(): Promise<BillCategoryDefinition[]> {
    let cached: string | null = null;
    try {
      cached = await this.redisClient.get('bills:categories');
    } catch {
      cached = null;
    }
    if (cached) {
      try {
        return JSON.parse(cached) as BillCategoryDefinition[];
      } catch {
        // ignore malformed cache and refresh from provider
      }
    }
    const categories = await this.executeWithProviderGuard(() => this.billsProvider.listCategories());
    try {
      await this.redisClient.setex('bills:categories', 300, JSON.stringify(categories));
    } catch {
      // cache write errors should not break bill payments
    }
    return categories;
  }

  private normalizeBillerId(value: string) {
    return value.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  private normalizeFields(fields: Record<string, string>) {
    return Object.entries(fields).reduce<Record<string, string>>((acc, [key, value]) => {
      acc[key.trim()] = String(value ?? '').trim();
      return acc;
    }, {});
  }

  private assertValidationFields(
    biller: BillerDefinition & { category: string },
    fields: Record<string, string>
  ) {
    if (!biller.requiresValidation) {
      return;
    }
    const missing = biller.validationFields.filter((field) => !fields[field]);
    if (missing.length > 0) {
      throw new BillException(
        BillErrorCode.INVALID_CUSTOMER_REF,
        `Missing validation field(s): ${missing.join(', ')}`,
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private pickCustomerRef(
    biller: BillerDefinition & { category: string },
    fields: Record<string, string>
  ) {
    if (biller.validationFields.length === 0) {
      return '';
    }
    return fields[biller.validationFields[0]] ?? '';
  }

  private assertCustomerRef(value: string) {
    const stripped = value.replace(/\s+/g, '');
    if (stripped.length < 5) {
      throw new BillException(
        BillErrorCode.INVALID_CUSTOMER_REF,
        'Invalid meter/account number',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private computeFeeMinor(category: string, amountMinor: string) {
    if (category === 'airtime' || category === 'data') {
      return '0';
    }
    const twoPercent = BigInt(amountMinor) / 50n;
    const fee = twoPercent < 1000n ? 1000n : twoPercent;
    return fee.toString();
  }

  private reference(prefix: 'BVAL' | 'BIL' | 'NQR') {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `${prefix}-${date}-${suffix}`;
  }

  private generateSessionId() {
    const d = new Date();
    const y = d.getUTCFullYear().toString().slice(-2);
    const m = `${d.getUTCMonth() + 1}`.padStart(2, '0');
    const day = `${d.getUTCDate()}`.padStart(2, '0');
    const h = `${d.getUTCHours()}`.padStart(2, '0');
    const min = `${d.getUTCMinutes()}`.padStart(2, '0');
    const sec = `${d.getUTCSeconds()}`.padStart(2, '0');
    const suffix = Math.floor(Math.random() * 1_000_000)
      .toString()
      .padStart(6, '0');
    return `000015${y}${m}${day}${h}${min}${sec}${suffix}`;
  }

  private isLikelyQrPayload(qrData: string) {
    return qrData.trim().length >= 10 && /[0-9A-Za-z]/.test(qrData);
  }

  private async executeWithProviderGuard<T>(task: () => Promise<T | undefined>) {
    try {
      const result = await task();
      if (result === undefined) {
        throw new BillException(
          BillErrorCode.AGGREGATOR_UNAVAILABLE,
          'Aggregator unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      return result;
    } catch (error) {
      throw this.wrapProviderError(error);
    }
  }

  private wrapProviderError(error: unknown): HttpException {
    if (error instanceof BillException) {
      return error;
    }
    if (error instanceof HttpException) {
      if (error.getStatus() >= 500 || error.getStatus() === HttpStatus.REQUEST_TIMEOUT) {
        return new BillException(
          BillErrorCode.AGGREGATOR_UNAVAILABLE,
          'Aggregator unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      return error;
    }
    return new BillException(
      BillErrorCode.AGGREGATOR_UNAVAILABLE,
      'Aggregator unavailable',
      HttpStatus.SERVICE_UNAVAILABLE,
      { message: this.extractErrorMessage(error) }
    );
  }

  private wrapDebitError(error: unknown): HttpException {
    const message = this.extractErrorMessage(error).toLowerCase();
    if (message.includes('insufficient funds')) {
      return new BillException(
        BillErrorCode.INSUFFICIENT_FUNDS,
        'Insufficient funds',
        HttpStatus.BAD_REQUEST
      );
    }
    if (error instanceof HttpException) {
      return error;
    }
    return new BadRequestException(this.extractErrorMessage(error));
  }

  private extractErrorMessage(error: unknown) {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return 'Unknown error';
  }
}
