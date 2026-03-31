import { OnboardingDraft } from '../screens/auth/onboarding';

export type AuthStackParamList = {
  Welcome: undefined;
  Login: undefined;
  OnboardingPhone: undefined;
  OnboardingOtp: {
    email: string;
  };
  OnboardingBiodata: {
    email: string;
  };
  OnboardingKyc: OnboardingDraft;
  OnboardingLiveness: OnboardingDraft;
  Register: undefined;
};
