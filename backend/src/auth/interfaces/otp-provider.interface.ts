import { OtpChannel } from '../otp.service';

export interface OtpProvider {
  name: string;
  supportsChannel?(channel: OtpChannel): boolean;
  sendOtp(params: {
    to: string;
    channel: OtpChannel;
    purpose: string;
    code: string;
  }): Promise<{ accepted: boolean; reference?: string }>;
}
