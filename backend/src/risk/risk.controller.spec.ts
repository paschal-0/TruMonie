import { RiskController } from './risk.controller';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';

describe('RiskController', () => {
  it('registers device via device binding service', async () => {
    const usersService = {
      updateStatus: jest.fn()
    };
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined)
    };
    const deviceBindingsService = {
      bindDevice: jest.fn().mockResolvedValue({
        bindingId: 'device-1',
        boundAt: '2026-03-29T10:00:00.000Z',
        circuitBreaker: {
          active: true,
          maxTransactionAmount: 20000
        }
      })
    };

    const controller = new RiskController(
      usersService as unknown as ConstructorParameters<typeof RiskController>[0],
      auditService as unknown as ConstructorParameters<typeof RiskController>[1],
      deviceBindingsService as unknown as ConstructorParameters<typeof RiskController>[2]
    );

    const response = await controller.registerDevice(
      { id: 'user-1', role: UserRole.USER } as User,
      { fingerprint: 'fp-1', deviceType: 'ios' }
    );

    expect(deviceBindingsService.bindDevice).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({
        hardwareId: 'fp-1',
        platform: 'ios'
      }),
      'user-1'
    );
    expect(response).toEqual(
      expect.objectContaining({
        status: 'ok',
        deviceId: 'device-1'
      })
    );
  });

  it('freezes user status', async () => {
    const usersService = {
      updateStatus: jest.fn().mockResolvedValue(undefined)
    };
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined)
    };
    const deviceBindingsService = {
      bindDevice: jest.fn()
    };
    const controller = new RiskController(
      usersService as unknown as ConstructorParameters<typeof RiskController>[0],
      auditService as unknown as ConstructorParameters<typeof RiskController>[1],
      deviceBindingsService as unknown as ConstructorParameters<typeof RiskController>[2]
    );

    await controller.freezeUser({ id: 'admin-1', role: UserRole.ADMIN } as User, 'target-user');

    expect(usersService.updateStatus).toHaveBeenCalledWith('target-user', UserStatus.DISABLED);
    expect(auditService.record).toHaveBeenCalledWith('admin-1', 'USER_FREEZE', {
      target: 'target-user'
    });
  });
});
