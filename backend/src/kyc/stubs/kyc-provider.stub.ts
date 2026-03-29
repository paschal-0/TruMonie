import { Injectable, Logger } from '@nestjs/common';

import { KycProvider } from '../interfaces/kyc-provider.interface';

@Injectable()
export class KycProviderStub implements KycProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(KycProviderStub.name);

  async verifyBvnAndNin(params: {
    bvn: string;
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }> {
    // TODO: integrate with Smile Identity/Dojah/Seamfix, using vendor API key.
    this.logger.warn(`[KYC STUB] Verifying BVN/NIN for ${params.firstName} ${params.lastName}`);
    return {
      match: true,
      reference: `kyc-${Date.now()}`,
      metadata: { stub: true }
    };
  }
}
