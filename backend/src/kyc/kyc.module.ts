import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LedgerModule } from '../ledger/ledger.module';
import { UsersModule } from '../users/users.module';
import { LimitsModule } from '../limits/limits.module';
import { UserKycData } from './entities/user-kyc-data.entity';
import { KycVerification } from './entities/kyc-verification.entity';
import { KycController } from './kyc.controller';
import { KycService } from './kyc.service';
import { PiiCryptoService } from './pii-crypto.service';
import { KycProviderStub } from './stubs/kyc-provider.stub';
import { KYC_PROVIDER } from './kyc.constants';
import { LicensedKycProvider } from './providers/licensed-kyc.provider';

@Module({
  imports: [
    UsersModule,
    LedgerModule,
    LimitsModule,
    TypeOrmModule.forFeature([UserKycData, KycVerification])
  ],
  controllers: [KycController],
  providers: [
    KycService,
    PiiCryptoService,
    KycProviderStub,
    LicensedKycProvider,
    {
      provide: KYC_PROVIDER,
      useFactory: (
        configService: ConfigService,
        stubProvider: KycProviderStub,
        licensedProvider: LicensedKycProvider
      ) => {
        const selected = configService.get<string>('integrations.defaultKycProvider', 'licensed');
        return selected === licensedProvider.name ? licensedProvider : stubProvider;
      },
      inject: [ConfigService, KycProviderStub, LicensedKycProvider]
    }
  ],
  exports: [KycService]
})
export class KycModule {}
