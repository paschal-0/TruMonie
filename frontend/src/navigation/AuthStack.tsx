import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { AuthStackParamList } from './types';

import { LoginScreen } from '../screens/auth/LoginScreen';
import { OnboardingPhoneScreen } from '../screens/auth/OnboardingPhoneScreen';
import { OnboardingOtpScreen } from '../screens/auth/OnboardingOtpScreen';
import { OnboardingBiodataScreen } from '../screens/auth/OnboardingBiodataScreen';
import { OnboardingKycScreen } from '../screens/auth/OnboardingKycScreen';
import { OnboardingLivenessScreen } from '../screens/auth/OnboardingLivenessScreen';
import { RegisterScreen } from '../screens/auth/RegisterScreen';
import { WelcomeScreen } from '../screens/auth/WelcomeScreen';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export function AuthStack() {
  return (
    <Stack.Navigator id="auth-stack" screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Welcome" component={WelcomeScreen} />
      <Stack.Screen name="Login" component={LoginScreen} />
      <Stack.Screen name="OnboardingPhone" component={OnboardingPhoneScreen} />
      <Stack.Screen name="OnboardingOtp" component={OnboardingOtpScreen} />
      <Stack.Screen name="OnboardingBiodata" component={OnboardingBiodataScreen} />
      <Stack.Screen name="OnboardingKyc" component={OnboardingKycScreen} />
      <Stack.Screen name="OnboardingLiveness" component={OnboardingLivenessScreen} />
      <Stack.Screen name="Register" component={RegisterScreen} />
    </Stack.Navigator>
  );
}
