import { createHmac } from 'crypto';

export interface PaystackConfig {
  secretKey: string;
}

export class PaystackClient {
  constructor(private readonly config: PaystackConfig) {}

  verifySignature(payload: string, signature?: string): boolean {
    if (!signature) return false;
    const computed = createHmac('sha512', this.config.secretKey).update(payload).digest('hex');
    return computed === signature;
  }

  // TODO: implement HTTP calls to Paystack APIs when credentials/network are available.
}
