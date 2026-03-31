import { TwilioOtpProvider } from './twilio-otp.provider';

describe('TwilioOtpProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('sends sms OTP with twilio and returns reference sid', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: jest.fn().mockResolvedValue(JSON.stringify({ sid: 'SM123' }))
    } as never);

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'integrations.twilio.accountSid': 'AC123',
          'integrations.twilio.authToken': 'token',
          'integrations.twilio.fromNumber': '+15005550006',
          'integrations.twilio.messagingServiceSid': undefined,
          'integrations.twilio.baseUrl': 'https://api.twilio.com',
          'integrations.twilio.timeoutMs': 5000
        };
        return values[key] ?? fallback;
      })
    };

    const provider = new TwilioOtpProvider(
      configService as unknown as ConstructorParameters<typeof TwilioOtpProvider>[0]
    );

    const result = await provider.sendOtp({
      to: '+2348012345678',
      channel: 'sms',
      purpose: 'REGISTER',
      code: '123456'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
      expect.objectContaining({
        method: 'POST'
      })
    );
    expect(result).toEqual({ accepted: true, reference: 'SM123' });
  });

  it('normalizes local NG phone to E.164 before sending', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: jest.fn().mockResolvedValue(JSON.stringify({ sid: 'SM456' }))
    } as never);

    const configService = {
      get: jest.fn((key: string, fallback?: unknown) => {
        const values: Record<string, unknown> = {
          'integrations.twilio.accountSid': 'AC123',
          'integrations.twilio.authToken': 'token',
          'integrations.twilio.fromNumber': '+15005550006',
          'integrations.twilio.messagingServiceSid': undefined,
          'integrations.twilio.baseUrl': 'https://api.twilio.com',
          'integrations.twilio.timeoutMs': 5000
        };
        return values[key] ?? fallback;
      })
    };

    const provider = new TwilioOtpProvider(
      configService as unknown as ConstructorParameters<typeof TwilioOtpProvider>[0]
    );

    await provider.sendOtp({
      to: '07032102184',
      channel: 'sms',
      purpose: 'REGISTER',
      code: '654321'
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json',
      expect.objectContaining({
        body: expect.stringContaining('To=%2B2347032102184')
      })
    );
  });
});
