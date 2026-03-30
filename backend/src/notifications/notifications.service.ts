import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';

import { NotificationTemplateService, TemplatePayload } from './notification-template.service';
import { NotificationProvider } from './interfaces/notification-provider.interface';
import { NOTIFICATION_PROVIDERS } from './notifications.constants';
import { Notification } from './entities/notification.entity';

@Injectable()
export class NotificationsService {
  private readonly providers: Record<string, NotificationProvider>;

  constructor(
    private readonly templates: NotificationTemplateService,
    private readonly configService: ConfigService,
    @InjectRepository(Notification)
    private readonly notificationRepo: Repository<Notification>,
    @Inject(NOTIFICATION_PROVIDERS) providers: NotificationProvider[]
  ) {
    this.providers = providers.reduce<Record<string, NotificationProvider>>((acc, provider) => {
      acc[provider.name] = provider;
      return acc;
    }, {});
  }

  async send(userId: string, type: string, message: string) {
    const provider = this.resolveProvider();
    let result: { delivered: boolean; reference?: string };
    try {
      result = await provider.send({ userId, type, message });
    } catch {
      result = { delivered: false };
    }
    return this.notificationRepo.save(
      this.notificationRepo.create({
        userId,
        type,
        message,
        payload: null,
        provider: provider.name,
        providerReference: result.reference ?? null,
        delivered: result.delivered,
        readAt: null
      })
    );
  }

  async sendWithTemplate(userId: string, type: string, payload: TemplatePayload) {
    const message = this.templates.render(type, payload);
    const provider = this.resolveProvider();
    let result: { delivered: boolean; reference?: string };
    try {
      result = await provider.send({ userId, type, message, payload });
    } catch {
      result = { delivered: false };
    }
    return this.notificationRepo.save(
      this.notificationRepo.create({
        userId,
        type,
        message,
        payload,
        provider: provider.name,
        providerReference: result.reference ?? null,
        delivered: result.delivered,
        readAt: null
      })
    );
  }

  async listForUser(userId: string, limit = 50) {
    return this.notificationRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: Math.min(Math.max(limit, 1), 100)
    });
  }

  async unreadCount(userId: string) {
    const count = await this.notificationRepo.count({ where: { userId, readAt: IsNull() } });
    return { count };
  }

  async markRead(userId: string, id: string) {
    const notification = await this.notificationRepo.findOne({ where: { id, userId } });
    if (!notification) {
      throw new NotFoundException('Notification not found');
    }
    if (!notification.readAt) {
      notification.readAt = new Date();
      await this.notificationRepo.save(notification);
    }
    return notification;
  }

  async markAllRead(userId: string) {
    await this.notificationRepo
      .createQueryBuilder()
      .update(Notification)
      .set({ readAt: new Date() })
      .where('user_id = :userId', { userId })
      .andWhere('read_at IS NULL')
      .execute();
    return { success: true };
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
