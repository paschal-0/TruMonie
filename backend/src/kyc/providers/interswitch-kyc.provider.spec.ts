import { ServiceUnavailableException } from '@nestjs/common';

import { InterswitchKycProvider } from './interswitch-kyc.provider';

describe('InterswitchKycProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  function buildConfig(overrides: Record<string, unknown> = {}) {
    const values: Record<string, unknown> = {
      'integrations.interswitch.clientId': 'client-id',
      'integrations.interswitch.clientSecret': 'client-secret',
      'integrations.interswitch.oauthBaseUrl': 'https://qa.interswitchng.com',
      'integrations.interswitch.oauthTokenPath': '/passport/oauth/token',
      'integrations.interswitch.scope': 'profile',
      'integrations.interswitch.grantType': 'client_credentials',
      'integrations.interswitch.routingBaseUrl':
        'https://api-marketplace-routing.k8.isw.la/marketplace-routing/api/v1',
      'integrations.interswitch.bvnVerifyPath': '/verify/identity/bvn/verify',
      'integrations.interswitch.ninVerifyPath': '/verify/identity/nin/verify',
      'integrations.interswitch.faceComparePath': '/verify/identity/face-comparison',
      'integrations.interswitch.timeoutMs': 5000,
      ...overrides
    };
    return {
      get: jest.fn((key: string, fallback?: unknown) => values[key] ?? fallback)
    };
  }

  it('verifies BVN with oauth token and maps provider payload', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ access_token: 'token-123', expires_in: 3600 }))
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            success: true,
            code: '200',
            data: {
              id: 'bvn-ref-1',
              status: 'found',
              firstName: 'John',
              lastName: 'Doe',
              mobile: '08031234567'
            }
          })
        )
      } as never);

    const provider = new InterswitchKycProvider(
      buildConfig() as unknown as ConstructorParameters<typeof InterswitchKycProvider>[0]
    );

    const result = await provider.verifyBvn({
      bvn: '11111111111',
      firstName: 'John',
      lastName: 'Doe',
      dateOfBirth: '1988-04-04'
    });

    expect(result.match).toBe(true);
    expect(result.reference).toBe('bvn-ref-1');
    expect(result.metadata.source).toBe('interswitch-bvn');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  it('returns non-match for low confidence face comparison', async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest
          .fn()
          .mockResolvedValue(JSON.stringify({ access_token: 'token-123', expires_in: 3600 }))
      } as never)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        statusText: 'OK',
        text: jest.fn().mockResolvedValue(
          JSON.stringify({
            success: true,
            code: '200',
            data: {
              id: 'face-ref-1',
              imageComparison: {
                confidenceLevel: 29,
                threshold: 70,
                match: false
              }
            }
          })
        )
      } as never);

    const provider = new InterswitchKycProvider(
      buildConfig() as unknown as ConstructorParameters<typeof InterswitchKycProvider>[0]
    );

    const result = await provider.compareFace({
      image1: 'https://example.com/one.jpg',
      image2: 'https://example.com/two.jpg'
    });

    expect(result.match).toBe(false);
    expect(result.confidence).toBe(29);
    expect(result.threshold).toBe(70);
    expect(result.reference).toBe('face-ref-1');
  });

  it('throws when client credentials are missing', async () => {
    const provider = new InterswitchKycProvider(
      buildConfig({
        'integrations.interswitch.clientId': undefined,
        'integrations.interswitch.clientSecret': undefined
      }) as unknown as ConstructorParameters<typeof InterswitchKycProvider>[0]
    );

    await expect(
      provider.verifyBvn({
        bvn: '11111111111',
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1988-04-04'
      })
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
