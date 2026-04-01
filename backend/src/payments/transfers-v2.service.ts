import {
  BadRequestException,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { LimitsService } from '../limits/limits.service';
import { AccountsPolicy } from '../ledger/accounts.policy';
import { AccountsService } from '../ledger/accounts.service';
import { WalletTransactionStatus } from '../ledger/entities/wallet-transaction.entity';
import { Currency } from '../ledger/enums/currency.enum';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { LedgerService } from '../ledger/ledger.service';
import { WalletErrorCode, WalletException } from '../ledger/wallet.errors';
import { NotificationsService } from '../notifications/notifications.service';
import { REDIS_CLIENT } from '../redis/redis.module';
import { CircuitBreakerService } from '../risk/circuit-breaker.service';
import { VelocityService } from '../risk/velocity.service';
import { UsersService } from '../users/users.service';
import { PaymentProvider } from './interfaces/payment-provider.interface';
import { PaymentsService } from './payments.service';
import { Transfer, TransferDestinationType, TransferStatus } from './entities/transfer.entity';
import { TransferBeneficiary } from './entities/transfer-beneficiary.entity';
import { TransferErrorCode, TransferException } from './transfer.errors';

interface RedisClient {
  get: (key: string) => Promise<string | null>;
  setex: (key: string, ttl: number, value: string) => Promise<unknown>;
}

@Injectable()
export class TransfersV2Service {
  private readonly tsqBackoffSeconds = [0, 30, 60, 120, 300];
  private readonly tsqTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private readonly pendingResponseCodes = new Set(['01', '91', '96']);
  private readonly failedResponseCodes = new Set(['03', '12', '13', '51']);

  constructor(
    private readonly accountsPolicy: AccountsPolicy,
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
    private readonly usersService: UsersService,
    private readonly circuitBreakerService: CircuitBreakerService,
    private readonly velocityService: VelocityService,
    private readonly limitsService: LimitsService,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
    private readonly configService: ConfigService,
    @InjectRepository(Transfer)
    private readonly transferRepo: Repository<Transfer>,
    @InjectRepository(TransferBeneficiary)
    private readonly beneficiaryRepo: Repository<TransferBeneficiary>,
    @Inject(REDIS_CLIENT)
    private readonly redisClient: RedisClient
  ) {}

  async nameEnquiry(params: {
    userId: string;
    destinationBankCode: string;
    accountNumber: string;
    providerName?: string;
  }) {
    this.assertBankCode(params.destinationBankCode);
    this.assertAccountNumber(params.accountNumber);

    let resolved: { bankCode: string; accountNumber: string; accountName: string };
    try {
      resolved = await this.paymentsService.resolveBankAccount(
        params.destinationBankCode,
        params.accountNumber,
        params.providerName
      );
    } catch (error) {
      throw this.wrapProviderError(error);
    }

    if (!resolved.accountName || this.isUnresolvedName(resolved.accountName)) {
      throw new TransferException(
        TransferErrorCode.NAME_ENQUIRY_FAILED,
        'Name enquiry failed - account not found'
      );
    }

    const providerName = this.resolveProviderName(params.providerName);
    const sessionId = this.generateSessionId();
    await this.redisClient.setex(
      this.enquiryKey(sessionId),
      60 * 15,
      JSON.stringify({
        userId: params.userId,
        bankCode: resolved.bankCode,
        accountNumber: resolved.accountNumber,
        accountName: this.normalizeName(resolved.accountName),
        providerName
      })
    );

    return {
      account_name: this.normalizeName(resolved.accountName),
      account_number: resolved.accountNumber,
      bank_code: resolved.bankCode,
      bank_name: this.toBankName(resolved.bankCode),
      session_id: sessionId,
      kyc_level: 3
    };
  }

  async createBankTransfer(params: {
    userId: string;
    sourceWalletId: string;
    destinationBankCode: string;
    destinationAccount: string;
    destinationName: string;
    amountMinor: string;
    narration?: string;
    idempotencyKey: string;
    sessionId?: string;
    providerName?: string;
  }) {
    this.assertBankCode(params.destinationBankCode);
    this.assertAccountNumber(params.destinationAccount);
    if (BigInt(params.amountMinor) <= 0n) {
      throw new BadRequestException('amount must be greater than zero');
    }

    const existing = await this.transferRepo.findOne({
      where: { idempotencyKey: params.idempotencyKey }
    });
    if (existing) {
      if (existing.sourceUserId !== params.userId) {
        throw new TransferException(
          TransferErrorCode.DUPLICATE_TRANSFER,
          'Duplicate transfer idempotency key',
          HttpStatus.CONFLICT
        );
      }
      return this.toInitiationResponse(existing);
    }

    await this.accountsPolicy.assertOwnership(params.userId, params.sourceWalletId);
    const sourceWallet = await this.accountsService.findById(params.sourceWalletId);
    if (!sourceWallet || sourceWallet.userId !== params.userId) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Wallet not found',
        HttpStatus.NOT_FOUND
      );
    }
    if (sourceWallet.currency !== Currency.NGN) {
      throw new BadRequestException('Only NGN transfers are supported on NIP');
    }

    const user = await this.usersService.findById(params.userId);
    if (!user) {
      throw new NotFoundException('User not found');
    }

    const feeMinor = this.calculateTransferFee(params.amountMinor);
    const totalDebitMinor = (BigInt(params.amountMinor) + BigInt(feeMinor)).toString();
    if (BigInt(sourceWallet.balanceMinor) < BigInt(totalDebitMinor)) {
      throw new TransferException(
        TransferErrorCode.INSUFFICIENT_FUNDS,
        'Insufficient funds',
        HttpStatus.BAD_REQUEST
      );
    }

    await this.circuitBreakerService.assertWithinNewDeviceCap(params.userId, totalDebitMinor);
    await this.velocityService.assertWithinLimits(params.userId, Currency.NGN, totalDebitMinor);
    await this.limitsService.assertWithinLimits(
      params.userId,
      user.limitTier,
      totalDebitMinor,
      Currency.NGN
    );

    const enquiry = await this.validateEnquiry({
      userId: params.userId,
      destinationBankCode: params.destinationBankCode,
      destinationAccount: params.destinationAccount,
      destinationName: params.destinationName,
      sessionId: params.sessionId,
      providerName: params.providerName
    });

    const provider = this.resolveProvider(enquiry.providerName);
    const transfer = await this.transferRepo.save(
      this.transferRepo.create({
        reference: this.transferReference('TRF'),
        sessionId: params.sessionId ?? this.generateSessionId(),
        sourceWalletId: params.sourceWalletId,
        sourceUserId: params.userId,
        destinationType: TransferDestinationType.NIP,
        destinationAccount: params.destinationAccount,
        destinationBank: params.destinationBankCode,
        destinationName: this.normalizeName(params.destinationName),
        amountMinor: params.amountMinor,
        feeMinor,
        currency: Currency.NGN,
        narration: params.narration ?? null,
        status: TransferStatus.PROCESSING,
        nipResponseCode: null,
        nipResponseMessage: null,
        tsqAttempts: 0,
        completedAt: null,
        reversedAt: null,
        provider: provider.name,
        providerReference: null,
        idempotencyKey: params.idempotencyKey,
        metadata: {
          bankName: enquiry.bankName,
          initiatedAt: new Date().toISOString()
        }
      })
    );

    await this.debitForBankTransfer(transfer);

    try {
      const providerRes = await provider.initiatePayout(
        params.userId,
        params.amountMinor,
        Currency.NGN,
        {
          bankCode: params.destinationBankCode,
          accountNumber: params.destinationAccount,
          accountName: params.destinationName
        },
        params.narration
      );
      transfer.providerReference = providerRes.providerReference;
      transfer.sessionId = providerRes.sessionId ?? transfer.sessionId;
      const responseCode = this.normalizeResponseCode(
        providerRes.responseCode ?? this.providerStatusToCode(providerRes.status)
      );
      transfer.nipResponseCode = responseCode;
      transfer.nipResponseMessage =
        providerRes.responseMessage ?? this.responseMessageForCode(responseCode);

      const outcome = this.transferOutcome(providerRes.status, responseCode);
      if (outcome === TransferStatus.SUCCESS) {
        transfer.status = TransferStatus.SUCCESS;
        transfer.completedAt = new Date();
        await this.transferRepo.save(transfer);
        await this.markBeneficiaryUsed(params.userId, params.destinationBankCode, params.destinationAccount);
        await this.notificationsService.send(
          params.userId,
          'BANK_TRANSFER_SUCCESS',
          `Transfer ${transfer.reference} completed successfully.`
        );
      } else if (outcome === TransferStatus.FAILED) {
        transfer.status = TransferStatus.FAILED;
        await this.reverseDebit(transfer);
        await this.transferRepo.save(transfer);
        await this.notificationsService.send(
          params.userId,
          'BANK_TRANSFER_FAILED',
          `Transfer ${transfer.reference} failed and was reversed.`
        );
      } else {
        transfer.status = TransferStatus.PENDING;
        await this.transferRepo.save(transfer);
        this.scheduleTsq(transfer.id, transfer.tsqAttempts);
      }
    } catch (error) {
      if (this.isRetryableError(error)) {
        transfer.status = TransferStatus.PENDING;
        transfer.nipResponseCode = '01';
        transfer.nipResponseMessage = 'Transfer timed out - TSQ scheduled';
        await this.transferRepo.save(transfer);
        this.scheduleTsq(transfer.id, transfer.tsqAttempts);
        return {
          ...this.toInitiationResponse(transfer),
          warning_code: TransferErrorCode.TRANSFER_TIMEOUT
        };
      }

      transfer.status = TransferStatus.FAILED;
      transfer.nipResponseCode = '96';
      transfer.nipResponseMessage = this.errorMessage(error) ?? 'Transfer failed and was reversed';
      await this.reverseDebit(transfer);
      await this.transferRepo.save(transfer);
    }

    return this.toInitiationResponse(transfer);
  }

  async createInternalTransfer(params: {
    userId: string;
    sourceWalletId: string;
    destinationWalletId: string;
    amountMinor: string;
    narration?: string;
    idempotencyKey: string;
  }) {
    const existing = await this.transferRepo.findOne({
      where: { idempotencyKey: params.idempotencyKey }
    });
    if (existing) {
      if (existing.sourceUserId !== params.userId) {
        throw new TransferException(
          TransferErrorCode.DUPLICATE_TRANSFER,
          'Duplicate transfer idempotency key',
          HttpStatus.CONFLICT
        );
      }
      return this.toInternalResponse(existing);
    }

    await this.accountsPolicy.assertOwnership(params.userId, params.sourceWalletId);
    const sourceWallet = await this.accountsService.findById(params.sourceWalletId);
    const destinationWallet = await this.accountsService.findById(params.destinationWalletId);
    if (!sourceWallet || sourceWallet.userId !== params.userId) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Source wallet not found',
        HttpStatus.NOT_FOUND
      );
    }
    if (!destinationWallet) {
      throw new WalletException(
        WalletErrorCode.WALLET_NOT_FOUND,
        'Destination wallet not found',
        HttpStatus.NOT_FOUND
      );
    }
    if (sourceWallet.currency !== destinationWallet.currency) {
      throw new BadRequestException('Wallet currencies must match');
    }

    await this.ledgerService.transfer({
      sourceAccountId: params.sourceWalletId,
      destinationAccountId: params.destinationWalletId,
      amountMinor: params.amountMinor,
      currency: sourceWallet.currency,
      description: params.narration ?? 'Internal transfer',
      idempotencyKey: params.idempotencyKey
    });

    const transfer = await this.transferRepo.save(
      this.transferRepo.create({
        reference: this.transferReference('INT'),
        sessionId: null,
        sourceWalletId: params.sourceWalletId,
        sourceUserId: params.userId,
        destinationType: TransferDestinationType.INTERNAL,
        destinationAccount: destinationWallet.accountNumber ?? destinationWallet.id,
        destinationBank: null,
        destinationName: this.normalizeName(destinationWallet.label ?? 'Internal Wallet'),
        amountMinor: params.amountMinor,
        feeMinor: '0',
        currency: sourceWallet.currency,
        narration: params.narration ?? null,
        status: TransferStatus.SUCCESS,
        nipResponseCode: '00',
        nipResponseMessage: 'Approved or completed successfully',
        tsqAttempts: 0,
        completedAt: new Date(),
        reversedAt: null,
        provider: 'internal',
        providerReference: null,
        idempotencyKey: params.idempotencyKey,
        metadata: { destination_wallet_id: destinationWallet.id }
      })
    );

    return this.toInternalResponse(transfer);
  }

  async getTransferStatus(userId: string, transferId: string) {
    const transfer = await this.mustOwnTransfer(userId, transferId);
    if (
      transfer.destinationType === TransferDestinationType.NIP &&
      [TransferStatus.PENDING, TransferStatus.PROCESSING].includes(transfer.status)
    ) {
      await this.tryResolveTsq(transfer, true);
    }

    const latest = await this.transferRepo.findOne({ where: { id: transferId } });
    return {
      transfer_id: transferId,
      reference: latest?.reference ?? transfer.reference,
      status: latest?.status ?? transfer.status,
      nip_response_code: latest?.nipResponseCode ?? transfer.nipResponseCode,
      nip_response_message: latest?.nipResponseMessage ?? transfer.nipResponseMessage,
      completed_at: latest?.completedAt?.toISOString() ?? null
    };
  }

  async getTransferReceipt(userId: string, transferId: string) {
    const transfer = await this.mustOwnTransfer(userId, transferId);
    const user = await this.usersService.findById(userId);
    const sourceWallet = await this.accountsService.findById(transfer.sourceWalletId);
    const amount = Number(transfer.amountMinor) / 100;
    const fee = Number(transfer.feeMinor) / 100;

    return {
      receipt_id: transfer.receiptId,
      reference: transfer.reference,
      type: 'TRANSFER',
      from: {
        name: `${user?.firstName ?? ''} ${user?.lastName ?? ''}`.trim() || user?.email || 'User',
        account: sourceWallet?.accountNumber ?? transfer.sourceWalletId
      },
      to: {
        name: transfer.destinationName,
        account: transfer.destinationAccount,
        bank: transfer.destinationBank ? this.toBankName(transfer.destinationBank) : 'TRUMONIE'
      },
      amount: this.formatMoney(amount, transfer.currency),
      fee: this.formatMoney(fee, transfer.currency),
      total: this.formatMoney(amount + fee, transfer.currency),
      status: this.receiptStatus(transfer.status),
      timestamp: (transfer.completedAt ?? transfer.updatedAt).toISOString(),
      session_id: transfer.sessionId,
      qr_code_url: `${this.publicBaseUrl()}/api/transfers/${transfer.id}/receipt`
    };
  }

  async saveBeneficiary(userId: string, params: {
    accountNumber: string;
    bankCode: string;
    accountName: string;
    alias?: string;
    bankName?: string;
  }) {
    this.assertBankCode(params.bankCode);
    this.assertAccountNumber(params.accountNumber);
    const existing = await this.beneficiaryRepo.findOne({
      where: {
        userId,
        bankCode: params.bankCode,
        accountNumber: params.accountNumber,
        deletedAt: IsNull()
      }
    });
    if (existing) {
      existing.accountName = this.normalizeName(params.accountName);
      existing.alias = params.alias?.trim() || existing.alias;
      existing.bankName = params.bankName?.trim() || existing.bankName;
      return this.beneficiaryRepo.save(existing);
    }
    return this.beneficiaryRepo.save(
      this.beneficiaryRepo.create({
        userId,
        accountNumber: params.accountNumber,
        bankCode: params.bankCode,
        accountName: this.normalizeName(params.accountName),
        alias: params.alias?.trim() || null,
        bankName: params.bankName?.trim() || this.toBankName(params.bankCode),
        lastUsedAt: null,
        deletedAt: null
      })
    );
  }

  async listBeneficiaries(userId: string) {
    const rows = await this.beneficiaryRepo.find({
      where: { userId, deletedAt: IsNull() },
      order: { lastUsedAt: 'DESC', createdAt: 'DESC' }
    });
    return {
      beneficiaries: rows.map((row) => ({
        id: row.id,
        alias: row.alias,
        account_name: row.accountName,
        account_number: row.accountNumber,
        bank_code: row.bankCode,
        bank_name: row.bankName,
        last_used_at: row.lastUsedAt?.toISOString() ?? null
      }))
    };
  }

  async deleteBeneficiary(userId: string, id: string) {
    const row = await this.beneficiaryRepo.findOne({ where: { id, userId, deletedAt: IsNull() } });
    if (!row) throw new NotFoundException('Beneficiary not found');
    row.deletedAt = new Date();
    await this.beneficiaryRepo.save(row);
    return { success: true };
  }

  private async mustOwnTransfer(userId: string, transferId: string) {
    const transfer = await this.transferRepo.findOne({ where: { id: transferId } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.sourceUserId !== userId) throw new ForbiddenException('Transfer does not belong to user');
    return transfer;
  }

  private async validateEnquiry(params: {
    userId: string;
    destinationBankCode: string;
    destinationAccount: string;
    destinationName: string;
    sessionId?: string;
    providerName?: string;
  }) {
    const expectedName = this.normalizeName(params.destinationName);
    const cached = await this.readEnquiry(params.sessionId);
    if (
      cached &&
      cached.userId === params.userId &&
      cached.bankCode === params.destinationBankCode &&
      cached.accountNumber === params.destinationAccount
    ) {
      if (this.normalizeName(cached.accountName) !== expectedName) {
        throw new TransferException(
          TransferErrorCode.NAME_MISMATCH,
          'Name mismatch (destination_name does not match name enquiry)',
          HttpStatus.BAD_REQUEST,
          { resolved_name: cached.accountName }
        );
      }
      return { providerName: cached.providerName, bankName: this.toBankName(cached.bankCode) };
    }

    const fresh = await this.nameEnquiry({
      userId: params.userId,
      destinationBankCode: params.destinationBankCode,
      accountNumber: params.destinationAccount,
      providerName: params.providerName
    });
    if (this.normalizeName(fresh.account_name) !== expectedName) {
      throw new TransferException(
        TransferErrorCode.NAME_MISMATCH,
        'Name mismatch (destination_name does not match name enquiry)',
        HttpStatus.BAD_REQUEST,
        { resolved_name: fresh.account_name }
      );
    }
    return {
      providerName: params.providerName ?? this.resolveProviderName(params.providerName),
      bankName: fresh.bank_name
    };
  }

  private async debitForBankTransfer(transfer: Transfer) {
    const settlement = this.settlementAccount(
      transfer.provider ?? this.resolveProviderName(undefined),
      transfer.currency
    );
    const feeAccount = this.feesAccount(transfer.currency);
    const totalDebit = (BigInt(transfer.amountMinor) + BigInt(transfer.feeMinor)).toString();

    const lines = [
      {
        accountId: transfer.sourceWalletId,
        direction: EntryDirection.DEBIT,
        amountMinor: totalDebit,
        currency: transfer.currency,
        category: 'TRANSFER',
        channel: 'BANK_TRANSFER',
        sessionId: transfer.sessionId ?? undefined,
        status: WalletTransactionStatus.SUCCESS,
        feeMinor: transfer.feeMinor
      },
      {
        accountId: settlement,
        direction: EntryDirection.CREDIT,
        amountMinor: transfer.amountMinor,
        currency: transfer.currency,
        category: 'TRANSFER',
        channel: 'BANK_TRANSFER',
        status: WalletTransactionStatus.SUCCESS
      }
    ];
    if (BigInt(transfer.feeMinor) > 0n) {
      lines.push({
        accountId: feeAccount,
        direction: EntryDirection.CREDIT,
        amountMinor: transfer.feeMinor,
        currency: transfer.currency,
        category: 'FEE',
        channel: 'BANK_TRANSFER',
        status: WalletTransactionStatus.SUCCESS
      });
    }

    await this.ledgerService.postEntry({
      reference: `TRF-DEBIT-${transfer.reference}`,
      idempotencyKey: `TRF-DEBIT-${transfer.id}`,
      description: `NIP transfer debit ${transfer.reference}`,
      enforceNonNegative: true,
      metadata: {
        category: 'TRANSFER',
        channel: 'BANK_TRANSFER',
        transferId: transfer.id
      },
      lines
    });
  }

  private async reverseDebit(transfer: Transfer) {
    if (transfer.reversedAt) return;
    const settlement = this.settlementAccount(
      transfer.provider ?? this.resolveProviderName(undefined),
      transfer.currency
    );
    const feeAccount = this.feesAccount(transfer.currency);
    const totalCredit = (BigInt(transfer.amountMinor) + BigInt(transfer.feeMinor)).toString();

    const lines = [
      {
        accountId: settlement,
        direction: EntryDirection.DEBIT,
        amountMinor: transfer.amountMinor,
        currency: transfer.currency,
        category: 'REVERSAL',
        channel: 'BANK_TRANSFER',
        status: WalletTransactionStatus.SUCCESS
      },
      {
        accountId: transfer.sourceWalletId,
        direction: EntryDirection.CREDIT,
        amountMinor: totalCredit,
        currency: transfer.currency,
        category: 'REVERSAL',
        channel: 'BANK_TRANSFER',
        sessionId: transfer.sessionId ?? undefined,
        status: WalletTransactionStatus.REVERSED,
        feeMinor: transfer.feeMinor
      }
    ];
    if (BigInt(transfer.feeMinor) > 0n) {
      lines.push({
        accountId: feeAccount,
        direction: EntryDirection.DEBIT,
        amountMinor: transfer.feeMinor,
        currency: transfer.currency,
        category: 'REVERSAL',
        channel: 'BANK_TRANSFER',
        status: WalletTransactionStatus.SUCCESS
      });
    }
    await this.ledgerService.postEntry({
      reference: `TRF-REV-${transfer.reference}`,
      idempotencyKey: `TRF-REV-${transfer.id}`,
      description: `NIP transfer reversal ${transfer.reference}`,
      enforceNonNegative: true,
      metadata: {
        category: 'REVERSAL',
        channel: 'BANK_TRANSFER',
        transferId: transfer.id
      },
      lines
    });
    transfer.reversedAt = new Date();
  }

  private scheduleTsq(transferId: string, attempts: number) {
    if (attempts >= this.tsqBackoffSeconds.length) {
      void this.markManualReview(transferId);
      return;
    }
    const existing = this.tsqTimers.get(transferId);
    if (existing) clearTimeout(existing);
    const delay = (this.tsqBackoffSeconds[attempts] ?? 0) * 1000;
    const timer = setTimeout(() => void this.runTsq(transferId), delay);
    this.tsqTimers.set(transferId, timer);
  }

  private async runTsq(transferId: string) {
    try {
      const transfer = await this.transferRepo.findOne({ where: { id: transferId } });
      if (!transfer) return;
      if (![TransferStatus.PENDING, TransferStatus.PROCESSING].includes(transfer.status)) return;
      await this.tryResolveTsq(transfer, true);
    } finally {
      this.tsqTimers.delete(transferId);
    }
  }

  private async tryResolveTsq(transfer: Transfer, scheduleIfPending: boolean) {
    const provider = this.resolveProvider(transfer.provider ?? undefined);
    if (!provider.queryTransferStatus) {
      return transfer;
    }

    try {
      const res = await provider.queryTransferStatus({
        providerReference: transfer.providerReference ?? undefined,
        reference: transfer.reference,
        sessionId: transfer.sessionId ?? undefined
      });
      transfer.tsqAttempts += 1;
      const code = this.normalizeResponseCode(res.responseCode);
      transfer.nipResponseCode = code;
      transfer.nipResponseMessage = res.responseMessage ?? this.responseMessageForCode(code);
      const outcome = this.transferOutcome(res.status, code);

      if (outcome === TransferStatus.SUCCESS) {
        transfer.status = TransferStatus.SUCCESS;
        transfer.completedAt = res.completedAt ? new Date(res.completedAt) : new Date();
        await this.transferRepo.save(transfer);
        await this.markBeneficiaryUsed(transfer.sourceUserId, transfer.destinationBank ?? '', transfer.destinationAccount);
        return transfer;
      }
      if (outcome === TransferStatus.FAILED) {
        transfer.status = TransferStatus.FAILED;
        await this.reverseDebit(transfer);
        await this.transferRepo.save(transfer);
        return transfer;
      }

      transfer.status = TransferStatus.PENDING;
      if (transfer.tsqAttempts >= this.tsqBackoffSeconds.length) {
        transfer.status = TransferStatus.MANUAL_REVIEW;
        transfer.nipResponseMessage = 'Manual review required';
        await this.transferRepo.save(transfer);
        return transfer;
      }
      await this.transferRepo.save(transfer);
      if (scheduleIfPending) this.scheduleTsq(transfer.id, transfer.tsqAttempts);
      return transfer;
    } catch {
      transfer.tsqAttempts += 1;
      if (transfer.tsqAttempts >= this.tsqBackoffSeconds.length) {
        transfer.status = TransferStatus.MANUAL_REVIEW;
        transfer.nipResponseCode = transfer.nipResponseCode ?? '01';
        transfer.nipResponseMessage = 'Manual review required';
        await this.transferRepo.save(transfer);
        return transfer;
      }
      await this.transferRepo.save(transfer);
      if (scheduleIfPending) this.scheduleTsq(transfer.id, transfer.tsqAttempts);
      return transfer;
    }
  }

  private async markManualReview(transferId: string) {
    const transfer = await this.transferRepo.findOne({ where: { id: transferId } });
    if (!transfer) return;
    if (![TransferStatus.PENDING, TransferStatus.PROCESSING].includes(transfer.status)) return;
    transfer.status = TransferStatus.MANUAL_REVIEW;
    transfer.nipResponseCode = transfer.nipResponseCode ?? '01';
    transfer.nipResponseMessage = 'Manual review required';
    await this.transferRepo.save(transfer);
  }

  private resolveProvider(providerName?: string): PaymentProvider {
    const resolvedName = this.resolveProviderName(providerName);
    const provider = this.paymentsService.getProvider(resolvedName);
    if (!provider) {
      throw new BadRequestException(`Unsupported provider "${resolvedName}"`);
    }
    return provider;
  }

  private resolveProviderName(providerName?: string) {
    return providerName ?? this.paymentsService.getDefaultProviderName();
  }

  private settlementAccount(providerName: string, currency: Currency) {
    const settlement = this.configService.get<
      Record<string, Partial<Record<Currency, string | undefined>> | undefined>
    >('systemAccounts.settlement');
    return settlement?.[providerName]?.[currency] ?? this.treasuryAccount(currency);
  }

  private feesAccount(currency: Currency) {
    const fees = this.configService.get<Record<string, string | undefined>>('systemAccounts.fees');
    return fees?.[currency] ?? this.treasuryAccount(currency);
  }

  private treasuryAccount(currency: Currency) {
    const treasury = this.configService.get<Record<string, string | undefined>>('systemAccounts.treasury');
    const accountId = treasury?.[currency];
    if (!accountId) {
      throw new BadRequestException(`Treasury account not configured for ${currency}`);
    }
    return accountId;
  }

  private async readEnquiry(sessionId?: string): Promise<{
    userId: string;
    bankCode: string;
    accountNumber: string;
    accountName: string;
    providerName: string;
  } | null> {
    if (!sessionId) return null;
    const raw = await this.redisClient.get(this.enquiryKey(sessionId));
    if (!raw) return null;
    try {
      return JSON.parse(raw) as {
        userId: string;
        bankCode: string;
        accountNumber: string;
        accountName: string;
        providerName: string;
      };
    } catch {
      return null;
    }
  }

  private async markBeneficiaryUsed(userId: string, bankCode: string, accountNumber: string) {
    const row = await this.beneficiaryRepo.findOne({
      where: { userId, bankCode, accountNumber, deletedAt: IsNull() }
    });
    if (!row) return;
    row.lastUsedAt = new Date();
    await this.beneficiaryRepo.save(row);
  }

  private toInitiationResponse(transfer: Transfer) {
    return {
      transfer_id: transfer.id,
      reference: transfer.reference,
      session_id: transfer.sessionId,
      amount: Number(transfer.amountMinor),
      fee: Number(transfer.feeMinor),
      status: transfer.status,
      estimated_completion: new Date(transfer.createdAt.getTime() + 5000).toISOString()
    };
  }

  private toInternalResponse(transfer: Transfer) {
    return {
      transfer_id: transfer.id,
      reference: transfer.reference,
      status: transfer.status,
      amount: Number(transfer.amountMinor),
      fee: Number(transfer.feeMinor),
      completed_at: transfer.completedAt?.toISOString() ?? null
    };
  }

  private calculateTransferFee(amountMinor: string) {
    const amount = BigInt(amountMinor);
    if (amount <= 500_000n) return '1060';
    if (amount <= 5_000_000n) return '2650';
    return '5300';
  }

  private providerStatusToCode(status: 'PENDING' | 'SUCCESS' | 'FAILED') {
    if (status === 'SUCCESS') return '00';
    if (status === 'FAILED') return '96';
    return '01';
  }

  private transferOutcome(status: 'PENDING' | 'SUCCESS' | 'FAILED', code: string) {
    if (this.failedResponseCodes.has(code)) return TransferStatus.FAILED;
    if (this.pendingResponseCodes.has(code)) return TransferStatus.PENDING;
    if (code === '00') return TransferStatus.SUCCESS;
    return status === 'FAILED' ? TransferStatus.FAILED : status === 'SUCCESS' ? TransferStatus.SUCCESS : TransferStatus.PENDING;
  }

  private normalizeResponseCode(code?: string) {
    if (!code) return '01';
    return code.padStart(2, '0');
  }

  private responseMessageForCode(code: string) {
    if (code === '00') return 'Approved or completed successfully';
    if (code === '01') return 'Status unknown';
    if (code === '03') return 'Invalid account';
    if (code === '12') return 'Invalid transaction';
    if (code === '13') return 'Invalid amount';
    if (code === '51') return 'Insufficient funds';
    if (code === '91') return 'Beneficiary bank unavailable';
    if (code === '96') return 'System malfunction';
    return 'Transfer processing';
  }

  private receiptStatus(status: TransferStatus) {
    if (status === TransferStatus.SUCCESS) return 'SUCCESSFUL';
    if (status === TransferStatus.FAILED) return 'FAILED';
    if (status === TransferStatus.MANUAL_REVIEW) return 'PENDING_REVIEW';
    return 'PROCESSING';
  }

  private formatMoney(amount: number, currency: string) {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(amount);
  }

  private transferReference(prefix: 'TRF' | 'INT') {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const suffix = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
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
    const suffix = Math.floor(Math.random() * 1_000_000).toString().padStart(6, '0');
    return `000015${y}${m}${day}${h}${min}${sec}${suffix}`;
  }

  private enquiryKey(sessionId: string) {
    return `trf:enquiry:${sessionId}`;
  }

  private assertBankCode(bankCode: string) {
    if (!/^\d{3}$/.test(bankCode)) {
      throw new TransferException(
        TransferErrorCode.INVALID_BANK_CODE,
        'Invalid bank code',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private assertAccountNumber(accountNumber: string) {
    if (!/^\d{10}$/.test(accountNumber)) {
      throw new TransferException(
        TransferErrorCode.NAME_ENQUIRY_FAILED,
        'Name enquiry failed - account not found',
        HttpStatus.BAD_REQUEST
      );
    }
  }

  private normalizeName(value: string) {
    return value.replace(/\s+/g, ' ').trim().toUpperCase();
  }

  private isUnresolvedName(value: string) {
    const normalized = this.normalizeName(value);
    return normalized.length === 0 || normalized.includes('UNRESOLVED');
  }

  private toBankName(bankCode: string) {
    const banks: Record<string, string> = {
      '001': 'ACCESS BANK',
      '011': 'FIRST BANK OF NIGERIA',
      '033': 'UNITED BANK FOR AFRICA',
      '044': 'ACCESS BANK (DIAMOND)',
      '050': 'ECOBANK',
      '057': 'ZENITH BANK',
      '058': 'GUARANTY TRUST BANK',
      '070': 'FIDELITY BANK',
      '214': 'FCMB',
      '221': 'STANBIC IBTC'
    };
    return banks[bankCode] ?? `BANK ${bankCode}`;
  }

  private publicBaseUrl() {
    const configured =
      this.configService.get<string>('app.publicBaseUrl') ?? process.env.APP_PUBLIC_BASE_URL;
    if (configured && configured.trim()) return configured.replace(/\/+$/, '');
    return 'https://trumonie.onrender.com';
  }

  private isRetryableError(error: unknown) {
    if (error instanceof HttpException) {
      const status = error.getStatus();
      return status >= 500 || status === HttpStatus.REQUEST_TIMEOUT;
    }
    const msg = this.errorMessage(error)?.toLowerCase() ?? '';
    return msg.includes('timeout') || msg.includes('timed out') || msg.includes('network');
  }

  private wrapProviderError(error: unknown): never {
    if (error instanceof TransferException) throw error;
    if (error instanceof HttpException) {
      if (error.getStatus() >= 500 || error.getStatus() === HttpStatus.REQUEST_TIMEOUT) {
        throw new TransferException(
          TransferErrorCode.NIP_UNAVAILABLE,
          'NIP service unavailable',
          HttpStatus.SERVICE_UNAVAILABLE
        );
      }
      throw error;
    }
    throw new TransferException(
      TransferErrorCode.NIP_UNAVAILABLE,
      'NIP service unavailable',
      HttpStatus.SERVICE_UNAVAILABLE
    );
  }

  private errorMessage(error: unknown): string | null {
    if (typeof error === 'string') return error;
    if (error instanceof Error) return error.message;
    return null;
  }
}
