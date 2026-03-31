import { OnboardingDraft } from '../screens/auth/onboarding';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  OnboardingPhone: undefined;
  OnboardingOtp: {
    phoneDisplay: string;
    phoneE164: string;
  };
  OnboardingBiodata: {
    phoneDisplay: string;
    phoneE164: string;
  };
  OnboardingKyc: OnboardingDraft;
  OnboardingLiveness: OnboardingDraft;
  Register: undefined;
};
