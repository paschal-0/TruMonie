import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { WalletEvent } from './entities/wallet-event.entity';

@Injectable()
export class WalletEventsService {
  private readonly logger = new Logger(WalletEventsService.name);

  constructor(
    @InjectRepository(WalletEvent)
    private readonly eventRepo: Repository<WalletEvent>
  ) {}

  async publish(params: {
    userId: string;
    walletId?: string | null;
    eventType: string;
    payload: Record<string, unknown>;
  }) {
    const event = await this.eventRepo.save(
      this.eventRepo.create({
        userId: params.userId,
        walletId: params.walletId ?? null,
        eventType: params.eventType,
        payload: params.payload,
        publishedAt: new Date()
      })
    );
    this.logger.debug(
      `Published wallet event ${event.eventType} for user=${event.userId} wallet=${event.walletId ?? 'n/a'}`
    );
    return event;
  }
}
