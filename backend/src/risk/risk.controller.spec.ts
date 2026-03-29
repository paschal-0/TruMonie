import { RiskController } from './risk.controller';
import { User, UserRole, UserStatus } from '../users/entities/user.entity';
import { DeviceStatus } from './entities/user-device.entity';

describe('RiskController', () => {
  it('registers a new device and stores audit metadata', async () => {
    const usersService = {
      updateStatus: jest.fn()
    };
    const auditService = {
      record: jest.fn().mockResolvedValue(undefined)
    };
    const userDeviceRepo = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((payload: unknown) => payload),
      merge: jest.fn(),
      save: jest.fn().mockResolvedValue({
        id: 'device-1',
        lastSeenAt: new Date('2026-03-29T10:00:00.000Z')
      })
    };

    const controller = new RiskController(
      usersService as unknown as ConstructorParameters<typeof RiskController>[0],
      auditService as unknown as ConstructorParameters<typeof RiskController>[1],
      userDeviceRepo as unknown as ConstructorParameters<typeof RiskController>[2]
    );

    const response = await controller.registerDevice(
      { id: 'user-1', role: UserRole.USER } as User,
      { fingerprint: 'fp-1', deviceType: 'ios' }
    );

    expect(userDeviceRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        fingerprint: 'fp-1',
        status: DeviceStatus.ACTIVE
      })
    );
    expect(auditService.record).toHaveBeenCalledWith(
      'user-1',
      'DEVICE_REGISTER',
      expect.objectContaining({ fingerprint: 'fp-1', deviceId: 'device-1' })
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
    const userDeviceRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      merge: jest.fn(),
      save: jest.fn()
    };
    const controller = new RiskController(
      usersService as unknown as ConstructorParameters<typeof RiskController>[0],
      auditService as unknown as ConstructorParameters<typeof RiskController>[1],
      userDeviceRepo as unknown as ConstructorParameters<typeof RiskController>[2]
    );

    await controller.freezeUser(
      { id: 'admin-1', role: UserRole.ADMIN } as User,
      'target-user'
    );

    expect(usersService.updateStatus).toHaveBeenCalledWith('target-user', UserStatus.DISABLED);
    expect(auditService.record).toHaveBeenCalledWith('admin-1', 'USER_FREEZE', {
      target: 'target-user'
    });
  });
});
