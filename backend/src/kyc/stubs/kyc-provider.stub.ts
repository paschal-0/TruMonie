import { Injectable, Logger } from '@nestjs/common';

import { KycProvider } from '../interfaces/kyc-provider.interface';

@Injectable()
export class KycProviderStub implements KycProvider {
  readonly name = 'stub';
  private readonly logger = new Logger(KycProviderStub.name);

  async verifyBvn(params: {
    bvn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phone?: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }> {
    this.logger.warn(`[KYC STUB] BVN verification for ${params.firstName} ${params.lastName}`);
    return {
      match: true,
      reference: `bvn-${Date.now()}`,
      metadata: {
        firstName: params.firstName,
        lastName: params.lastName,
        dateOfBirth: params.dateOfBirth,
        phoneNumber: params.phone ?? null,
        stub: true
      }
    };
  }

  async verifyNin(params: {
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }> {
    this.logger.warn(`[KYC STUB] NIN verification for ${params.firstName} ${params.lastName}`);
    return {
      match: true,
      reference: `nin-${Date.now()}`,
      metadata: {
        firstName: params.firstName,
        lastName: params.lastName,
        dateOfBirth: params.dateOfBirth ?? null,
        stub: true
      }
    };
  }

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
