import { Injectable } from '@nestjs/common';

export interface TemplatePayload {
  [key: string]: string | number | null | undefined;
}

@Injectable()
export class NotificationTemplateService {
  private readonly templates: Record<string, string> = {
    AJO_REMINDER: 'Ajo contribution due soon. Amount: {{amount}} {{currency}}. Due: {{due}}',
    AJO_PAYOUT: 'You received {{amount}} {{currency}} from group {{group}}',
    AJO_JOIN: 'You joined group {{group}}'
  };

  render(type: string, payload: TemplatePayload) {
    const template = this.templates[type] || '{{message}}';
    return template.replace(/{{(\w+)}}/g, (_, key) => String(payload[key] ?? ''));
  }
}
