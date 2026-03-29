import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { NotificationTemplateService, TemplatePayload } from './notification-template.service';
import { NotificationProvider } from './interfaces/notification-provider.interface';
import { NOTIFICATION_PROVIDERS } from './notifications.constants';

@Injectable()
export class NotificationsService {
  private readonly providers: Record<string, NotificationProvider>;

  constructor(
    private readonly templates: NotificationTemplateService,
    private readonly configService: ConfigService,
    @Inject(NOTIFICATION_PROVIDERS) providers: NotificationProvider[]
  ) {
    this.providers = providers.reduce<Record<string, NotificationProvider>>((acc, provider) => {
      acc[provider.name] = provider;
      return acc;
    }, {});
  }

  async send(userId: string, type: string, message: string) {
    const provider = this.resolveProvider();
    return provider.send({ userId, type, message });
  }

  async sendWithTemplate(userId: string, type: string, payload: TemplatePayload) {
    const message = this.templates.render(type, payload);
    const provider = this.resolveProvider();
    return provider.send({ userId, type, message, payload });
  }

  private resolveProvider(): NotificationProvider {
    const configured = this.configService.get<string>(
      'integrations.defaultNotificationProvider',
      'licensed'
    );
    const provider = this.providers[configured];
    if (!provider) {
      const supported = Object.keys(this.providers).join(', ');
      throw new BadRequestException(
        `Unsupported notification provider "${configured}". Supported providers: ${supported}`
      );
    }
    return provider;
  }
}
