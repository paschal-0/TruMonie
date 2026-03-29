import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { CardsController } from './cards.controller';
import { CardsService } from './cards.service';
import { Card } from './entities/card.entity';
import { CARD_PROVIDERS } from './cards.constants';
import { StubCardProvider } from './providers/stub-card.provider';
import { LicensedCardProvider } from './providers/licensed-card.provider';

@Module({
  imports: [LedgerModule, TypeOrmModule.forFeature([Card])],
  controllers: [CardsController],
  providers: [
    CardsService,
    StubCardProvider,
    LicensedCardProvider,
    {
      provide: CARD_PROVIDERS,
      useFactory: (stubProvider: StubCardProvider, licensedProvider: LicensedCardProvider) => [
        stubProvider,
        licensedProvider
      ],
      inject: [StubCardProvider, LicensedCardProvider]
    }
  ],
  exports: [CardsService]
})
export class CardsModule {}
