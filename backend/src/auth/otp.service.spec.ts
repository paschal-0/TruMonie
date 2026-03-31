import { OtpService } from './otp.service';

describe('OtpService', () => {
  it('stores otp and dispatches through configured provider', async () => {
    const redisClient = {
      setex: jest.fn().mockResolvedValue(undefined),
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue('OK'),
      ttl: jest.fn().mockResolvedValue(300),
      del: jest.fn().mockResolvedValue(1)
    };
    const configService = {
      get: jest.fn().mockReturnValue('licensed')
    };
    const licensedProvider = {
      name: 'licensed',
      supportsChannel: jest.fn().mockReturnValue(true),
      sendOtp: jest.fn().mockResolvedValue({ accepted: true })
    };

    const service = new OtpService(
      redisClient as unknown as ConstructorParameters<typeof OtpService>[0],
      configService as unknown as ConstructorParameters<typeof OtpService>[1],
      [licensedProvider] as unknown as ConstructorParameters<typeof OtpService>[2]
    );

    const response = await service.sendOtp('user@example.com', 'email', 'LOGIN');

    expect(redisClient.setex).toHaveBeenCalledWith('otp:LOGIN:user@example.com', 300, expect.any(String));
    expect(licensedProvider.sendOtp).toHaveBeenCalledWith(
      expect.objectContaining({
        to: 'user@example.com',
        channel: 'email',
        purpose: 'LOGIN',
        code: expect.stringMatching(/^\d{6}$/)
      })
    );
    expect(response).toEqual({ message: 'OTP sent', expiresIn: 300, resendAfter: 60 });
  });
});
