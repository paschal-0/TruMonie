import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AccountsService } from '../ledger/accounts.service';
import { Card, CardStatus } from './entities/card.entity';
import { CreateCardDto } from './dto/create-card.dto';
import { CARD_PROVIDERS } from './cards.constants';
import { CardProvider } from './interfaces/card-provider.interface';

@Injectable()
export class CardsService {
  private readonly providers: Record<string, CardProvider>;

  constructor(
    @InjectRepository(Card)
    private readonly cardRepo: Repository<Card>,
    private readonly accountsService: AccountsService,
    private readonly configService: ConfigService,
    @Inject(CARD_PROVIDERS) providers: CardProvider[]
  ) {
    this.providers = providers.reduce<Record<string, CardProvider>>((acc, provider) => {
      acc[provider.name] = provider;
      return acc;
    }, {});
  }

  async list(userId: string) {
    return this.cardRepo.find({ where: { userId }, order: { createdAt: 'DESC' } });
  }

  async create(userId: string, dto: CreateCardDto) {
    const funding = await this.accountsService.findById(dto.fundingAccountId);
    if (!funding || funding.userId !== userId) {
      throw new NotFoundException('Funding account not found');
    }
    if (funding.currency !== dto.currency) {
      throw new BadRequestException('Currency mismatch');
    }

    const provider = this.resolveProvider(dto.provider);
    if (provider.supportsCurrency && !provider.supportsCurrency(dto.currency)) {
      throw new BadRequestException(`Card provider ${provider.name} does not support ${dto.currency}`);
    }
    const cardRes = await provider.createCard({
      userId,
      currency: dto.currency,
      fundingAccountId: funding.id
    });

    const card = this.cardRepo.create({
      userId,
      fundingAccountId: funding.id,
      currency: dto.currency,
      provider: provider.name,
      providerReference: cardRes.providerReference,
      last4: cardRes.last4
    });
    return this.cardRepo.save(card);
  }

  async block(userId: string, cardId: string) {
    const card = await this.cardRepo.findOne({ where: { id: cardId, userId } });
    if (!card) throw new NotFoundException('Card not found');
    const provider = this.resolveProvider(card.provider);
    await provider.blockCard({ providerReference: card.providerReference });
    card.status = CardStatus.BLOCKED;
    return this.cardRepo.save(card);
  }

  async unblock(userId: string, cardId: string) {
    const card = await this.cardRepo.findOne({ where: { id: cardId, userId } });
    if (!card) throw new NotFoundException('Card not found');
    const provider = this.resolveProvider(card.provider);
    await provider.unblockCard({ providerReference: card.providerReference });
    card.status = CardStatus.ACTIVE;
    return this.cardRepo.save(card);
  }

  private resolveProvider(providerName?: string): CardProvider {
    const resolvedName = providerName ?? this.getDefaultProviderName();
    const provider = this.providers[resolvedName];
    if (!provider) {
      const supported = Object.keys(this.providers).join(', ');
      throw new BadRequestException(
        `Unsupported card provider "${resolvedName}". Supported providers: ${supported}`
      );
    }
    return provider;
  }

  private getDefaultProviderName(): string {
    return this.configService.get<string>('integrations.defaultCardsProvider', 'licensed');
  }
}
