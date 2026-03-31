import { ResendOtpProvider } from './resend-otp.provider';

describe('ResendOtpProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends email OTP with resend and returns message id reference', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: jest.fn().mockResolvedValue(JSON.stringify({ id: 're_123' }))
    } as never);

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'integrations.resend.apiKey': 're_test_key',
          'integrations.resend.fromEmail': 'onboarding@trumonie.app',
          'integrations.resend.baseUrl': 'https://api.resend.com',
          'integrations.resend.timeoutMs': 5000
        };
        return values[key] ?? fallback;
      })
    };

    const provider = new ResendOtpProvider(
      configService as unknown as ConstructorParameters<typeof ResendOtpProvider>[0]
    );

    const result = await provider.sendOtp({
      to: 'user@example.com',
      channel: 'email',
      purpose: 'REGISTER',
      code: '123456'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.resend.com/emails',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(result).toEqual({ accepted: true, reference: 're_123' });
  });
});
