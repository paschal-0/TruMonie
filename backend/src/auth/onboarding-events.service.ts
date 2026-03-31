import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { OnboardingEvent } from './entities/onboarding-event.entity';

@Injectable()
export class OnboardingEventsService {
  constructor(
    @InjectRepository(OnboardingEvent)
    private readonly eventsRepo: Repository<OnboardingEvent>
  ) {}

  async publish(userId: string, eventType: string, payload: Record<string, unknown>) {
    return this.eventsRepo.save(
      this.eventsRepo.create({
        userId,
        eventType,
        payload,
        publishedAt: new Date()
      })
    );
  }
}
