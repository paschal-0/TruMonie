import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { NumericPad } from '../../components/NumericPad';
import { ThemedText } from '../../components/Themed';
import { GradientButton } from '../../components/GradientButton';
import { useSendOtp } from '../../hooks/useAuthActions';
import { colors, radius } from '../../theme';
import { formatLocalPhone, normalizePhoneToE164 } from './onboarding';
import { AuthStackParamList } from '../../navigation/types';

export const OnboardingPhoneScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'OnboardingPhone'>>();
  const sendOtp = useSendOtp();
  const [phoneInput, setPhoneInput] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const formatted = useMemo(() => formatLocalPhone(phoneInput), [phoneInput]);
  const canContinue = phoneInput.length === 11 && phoneInput.startsWith('0');

  const onContinue = () => {
    const e164 = normalizePhoneToE164(phoneInput);
    if (!e164) {
      setLocalError('Enter a valid 11-digit Nigerian phone number');
      return;
    }
    setLocalError(null);
    sendOtp.mutate(
      { phone: e164, purpose: 'REGISTER', channel: 'sms' },
      {
        onSuccess: () => {
          navigation.navigate('OnboardingOtp', { phoneDisplay: phoneInput, phoneE164: e164 });
        }
      }
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Create Account</ThemedText>
        <ThemedText style={styles.subtitle}>Enter your phone number to receive OTP.</ThemedText>
      </View>

      <View style={styles.phoneBox}>
        <ThemedText style={styles.label}>Phone Number</ThemedText>
        <ThemedText style={styles.phoneValue}>{formatted || '0___ ___ ____'}</ThemedText>
      </View>

      <NumericPad
        onDigit={(digit) => setPhoneInput((prev) => (prev.length >= 11 ? prev : `${prev}${digit}`))}
        onBackspace={() => setPhoneInput((prev) => prev.slice(0, -1))}
        onClear={() => setPhoneInput('')}
      />

      {(localError || sendOtp.error) && (
        <ThemedText style={styles.error}>
          {localError || (sendOtp.error as Error | undefined)?.message}
        </ThemedText>
      )}

      {sendOtp.isPending ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 10 }} />
      ) : (
        <GradientButton title="Continue" onPress={onContinue} disabled={!canContinue} style={styles.cta} />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 48,
    backgroundColor: colors.bg,
    gap: 14
  },
  header: {
    marginBottom: 10
  },
  title: {
    fontSize: 30,
    fontWeight: '800'
  },
  subtitle: {
    marginTop: 6,
    color: colors.textSecondary
  },
  phoneBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.6
  },
  phoneValue: {
    marginTop: 8,
    fontSize: 28,
    letterSpacing: 1.2,
    fontWeight: '700'
  },
  error: {
    color: '#ff8f8f',
    marginTop: 4
  },
  cta: {
    marginTop: 'auto',
    marginBottom: 8
  }
});
