export interface KycProvider {
  name: string;
  verifyBvn?(params: {
    bvn: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
    phone?: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }>;
  verifyNin?(params: {
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth?: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }>;
  verifyBvnAndNin(params: {
    bvn: string;
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }>;
  compareFace?(params: {
    image1: string;
    image2: string;
  }): Promise<{
    match: boolean;
    confidence: number;
    threshold: number;
    reference: string;
    metadata: Record<string, unknown>;
  }>;
}
