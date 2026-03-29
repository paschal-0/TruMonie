import { createHmac } from 'crypto';

export interface FlutterwaveConfig {
  secretHash: string;
}

export class FlutterwaveClient {
  constructor(private readonly config: FlutterwaveConfig) {}

  verifySignature(payload: string, signature?: string): boolean {
    if (!signature) return false;
    const computed = createHmac('sha256', this.config.secretHash).update(payload).digest('hex');
    return computed === signature;
  }

  // TODO: implement HTTP calls to Flutterwave APIs when credentials/network are available.
}
