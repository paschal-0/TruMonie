import { Injectable, Logger } from '@nestjs/common';

import { NotificationProvider } from '../interfaces/notification-provider.interface';

@Injectable()
export class InternalNotificationProvider implements NotificationProvider {
  readonly name = 'internal';
  private readonly logger = new Logger(InternalNotificationProvider.name);

  async send(params: { userId: string; type: string; message: string }) {
    this.logger.log(
      `Notification dispatched internally user=${params.userId} type=${params.type}`
    );
    return {
      delivered: true,
      reference: `INTERNAL-NOTIFY-${Date.now()}`
    };
  }
}
