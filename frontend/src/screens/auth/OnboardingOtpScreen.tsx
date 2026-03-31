import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GradientButton } from '../../components/GradientButton';
import { NumericPad } from '../../components/NumericPad';
import { ThemedText } from '../../components/Themed';
import { useSendOtp, useVerifyOtp } from '../../hooks/useAuthActions';
import { colors, radius } from '../../theme';
import { AuthStackParamList } from '../../navigation/types';

export const OnboardingOtpScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'OnboardingOtp'>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'OnboardingOtp'>>();
  const { email } = route.params;
  const hasContext = Boolean(email);

  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();

  const [code, setCode] = useState('');
  const [secondsLeft, setSecondsLeft] = useState(60);
  const [localError, setLocalError] = useState<string | null>(null);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = setTimeout(() => setSecondsLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  const onVerify = () => {
    if (code.length !== 6) {
      setLocalError('Enter a valid 6-digit OTP');
      return;
    }
    setLocalError(null);
    if (!hasContext) {
      setLocalError('Email session missing. Restart onboarding.');
      return;
    }
    verifyOtp.mutate(
      { destination: email, purpose: 'REGISTER', code },
      {
        onSuccess: (payload: any) => {
          if (!payload?.verified) {
            setLocalError('OTP verification failed');
            return;
          }
          navigation.navigate('OnboardingBiodata', { email });
        }
      }
    );
  };

  const resend = () => {
    if (secondsLeft > 0) return;
    if (!hasContext) return;
    sendOtp.mutate(
      { destination: email, purpose: 'REGISTER', channel: 'email' },
      {
        onSuccess: (payload: any) => {
          const next = payload?.resendAfter ?? 60;
          setSecondsLeft(next);
        }
      }
    );
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>Verify Email</ThemedText>
      <ThemedText style={styles.subtitle}>OTP sent to {email}</ThemedText>

      <View style={styles.otpBox}>
        {[0, 1, 2, 3, 4, 5].map((slot) => (
          <View key={slot} style={styles.slot}>
            <ThemedText style={styles.slotText}>{code[slot] ?? ''}</ThemedText>
          </View>
        ))}
      </View>

      <NumericPad
        onDigit={(digit) => setCode((prev) => (prev.length >= 6 ? prev : `${prev}${digit}`))}
        onBackspace={() => setCode((prev) => prev.slice(0, -1))}
        onClear={() => setCode('')}
      />

      <ThemedText style={styles.meta}>
        {secondsLeft > 0 ? `Resend in ${secondsLeft}s` : "Didn't get code? Tap resend."}
      </ThemedText>
      <GradientButton title="Resend OTP" onPress={resend} style={styles.resend} disabled={secondsLeft > 0} />

      {(localError || sendOtp.error || verifyOtp.error) && (
        <ThemedText style={styles.error}>
          {localError ||
            (sendOtp.error as Error | undefined)?.message ||
            (verifyOtp.error as Error | undefined)?.message}
        </ThemedText>
      )}

      {verifyOtp.isPending ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />
      ) : (
        <GradientButton
          title="Verify & Continue"
          onPress={onVerify}
          style={styles.cta}
          disabled={!hasContext}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg,
    padding: 20,
    paddingTop: 48
  },
  title: {
    fontSize: 30,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 6,
    color: colors.textSecondary
  },
  otpBox: {
    marginTop: 20,
    marginBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  slot: {
    width: 48,
    height: 56,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)'
  },
  slotText: {
    fontSize: 22,
    fontWeight: '700'
  },
  meta: {
    textAlign: 'center',
    marginTop: 14,
    color: colors.textSecondary
  },
  resend: {
    marginTop: 10
  },
  error: {
    color: '#ff8f8f',
    marginTop: 12
  },
  cta: {
    marginTop: 'auto',
    marginBottom: 8
  }
});
