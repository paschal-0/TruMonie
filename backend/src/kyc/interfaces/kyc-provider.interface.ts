export interface KycProvider {
  name: string;
  verifyBvnAndNin(params: {
    bvn: string;
    nin: string;
    firstName: string;
    lastName: string;
    dateOfBirth: string;
  }): Promise<{ match: boolean; reference: string; metadata: Record<string, unknown> }>;
}
