export interface NotificationProvider {
  name: string;
  send(params: {
    userId: string;
    type: string;
    message: string;
    payload?: Record<string, unknown>;
  }): Promise<{ delivered: boolean; reference?: string }>;
}
