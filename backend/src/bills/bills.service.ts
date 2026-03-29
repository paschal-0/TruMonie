import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsService } from '../ledger/accounts.service';
import { LedgerService } from '../ledger/ledger.service';
import { Currency } from '../ledger/enums/currency.enum';
import { EntryDirection } from '../ledger/enums/entry-direction.enum';
import { SystemAccountsConfig } from '../config/configuration';
import { BillPayment, BillStatus } from './entities/bill-payment.entity';
import { BillBeneficiary } from './entities/bill-beneficiary.entity';
import { SaveBeneficiaryDto } from './dto/save-beneficiary.dto';
import { REDIS_CLIENT } from '../redis/redis.module';
import { BillsProvider } from './interfaces/bills-provider.interface';
import { BILLS_PROVIDER } from './bills.constants';

interface RedisClient {
  get(key: string): Promise<string | null>;
  setex(key: string, ttl: number, value: string): Promise<void>;
}

@Injectable()
export class BillsService {
  constructor(
    private readonly accountsService: AccountsService,
    private readonly ledgerService: LedgerService,
    @Inject(BILLS_PROVIDER) private readonly billsProvider: BillsProvider,
    @InjectRepository(BillPayment)
    private readonly billRepo: Repository<BillPayment>,
    @InjectRepository(BillBeneficiary)
    private readonly beneRepo: Repository<BillBeneficiary>,
    @Inject(REDIS_CLIENT) private readonly redisClient: RedisClient
  ) {}

  async catalog() {
    const cached = await this.redisClient.get('bills:catalog');
    if (cached) return JSON.parse(cached);
    const res = await this.billsProvider.listCatalog();
    await this.redisClient.setex('bills:catalog', 300, JSON.stringify(res));
    return res;
  }

  async purchase(params: {
    userId: string;
    currency: Currency;
    amountMinor: string;
    productCode: string;
    beneficiary: string;
    description?: string;
    systemAccounts: SystemAccountsConfig;
  }) {
    const accounts = await this.accountsService.getUserAccounts(params.userId);
    const wallet = accounts.find((a) => a.currency === params.currency);
    if (!wallet) {
      throw new BadRequestException('Wallet not found');
    }
    if (this.billsProvider.supportsCurrency && !this.billsProvider.supportsCurrency(params.currency)) {
      throw new BadRequestException(
        `Bills provider ${this.billsProvider.name} does not support ${params.currency}`
      );
    }

    const treasuryAccountId = params.systemAccounts.treasury[params.currency];
    if (!treasuryAccountId) {
      throw new BadRequestException('Treasury account not configured for bills');
    }

    const reference = `BILL-${Date.now()}`;
    const ledgerEntry = await this.ledgerService.postEntry({
      reference,
      idempotencyKey: reference,
      description: params.description ?? `Bill payment ${params.productCode}`,
      enforceNonNegative: true,
      lines: [
        {
          accountId: wallet.id,
          direction: EntryDirection.DEBIT,
          amountMinor: params.amountMinor,
          currency: params.currency
        },
        {
          accountId: treasuryAccountId,
          direction: EntryDirection.CREDIT,
          amountMinor: params.amountMinor,
          currency: params.currency
        }
      ]
    });

    const providerRes = await this.billsProvider.purchase({
      productCode: params.productCode,
      beneficiary: params.beneficiary,
      amountMinor: params.amountMinor,
      currency: params.currency,
      reference
    });

    await this.billRepo.save(
      this.billRepo.create({
        userId: params.userId,
        sourceAccountId: wallet.id,
        amountMinor: params.amountMinor,
        currency: params.currency,
        provider: this.billsProvider.name,
        providerReference: providerRes.providerReference,
        status:
          providerRes.status === 'FAILED'
            ? BillStatus.FAILED
            : providerRes.status === 'SUCCESS'
            ? BillStatus.SUCCESS
            : BillStatus.PENDING,
        request: {
          productCode: params.productCode,
          beneficiary: params.beneficiary
        },
        response: providerRes
      })
    );

    return { reference, ledgerEntry, providerStatus: providerRes.status };
  }

  async saveBeneficiary(userId: string, dto: SaveBeneficiaryDto) {
    const bene = this.beneRepo.create({
      userId,
      productCode: dto.productCode,
      destination: dto.destination,
      nickname: dto.nickname
    });
    return this.beneRepo.save(bene);
  }

  async listBeneficiaries(userId: string) {
    return this.beneRepo.find({ where: { userId } });
  }
}
