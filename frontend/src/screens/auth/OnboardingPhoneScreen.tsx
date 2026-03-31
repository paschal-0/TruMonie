import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GradientButton } from '../../components/GradientButton';
import { ThemedText } from '../../components/Themed';
import { useSendOtp } from '../../hooks/useAuthActions';
import { AuthStackParamList } from '../../navigation/types';
import { colors, radius } from '../../theme';

function normalizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

function isValidEmail(input: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input);
}

export const OnboardingPhoneScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'OnboardingPhone'>>();
  const sendOtp = useSendOtp();
  const [email, setEmail] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const normalizedEmail = normalizeEmail(email);
  const canContinue = isValidEmail(normalizedEmail);

  const onContinue = () => {
    if (!canContinue) {
      setLocalError('Enter a valid email address');
      return;
    }

    setLocalError(null);
    sendOtp.mutate(
      { destination: normalizedEmail, purpose: 'REGISTER', channel: 'email' },
      {
        onSuccess: () => {
          navigation.navigate('OnboardingOtp', { email: normalizedEmail });
        }
      }
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <ThemedText style={styles.title}>Create Account</ThemedText>
        <ThemedText style={styles.subtitle}>Enter your email to receive OTP.</ThemedText>
      </View>

      <View style={styles.emailBox}>
        <ThemedText style={styles.label}>Email Address</ThemedText>
        <TextInput
          value={email}
          onChangeText={setEmail}
          placeholder="name@example.com"
          placeholderTextColor={colors.textSecondary}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
        />
      </View>

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
  emailBox: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.05)',
    padding: 16,
    gap: 8
  },
  label: {
    fontSize: 12,
    color: colors.textSecondary,
    letterSpacing: 0.6
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
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
