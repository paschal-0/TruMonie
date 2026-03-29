import { Module } from '@nestjs/common';

import { NotificationTemplateService } from './notification-template.service';
import { NotificationsService } from './notifications.service';
import { InternalNotificationProvider } from './providers/internal-notification.provider';
import { LicensedNotificationProvider } from './providers/licensed-notification.provider';
import { NOTIFICATION_PROVIDERS } from './notifications.constants';

@Module({
  providers: [
    NotificationsService,
    NotificationTemplateService,
    InternalNotificationProvider,
    LicensedNotificationProvider,
    {
      provide: NOTIFICATION_PROVIDERS,
      useFactory: (
        internalProvider: InternalNotificationProvider,
        licensedProvider: LicensedNotificationProvider
      ) => [internalProvider, licensedProvider],
      inject: [InternalNotificationProvider, LicensedNotificationProvider]
    }
  ],
  exports: [NotificationsService]
})
export class NotificationsModule {}
