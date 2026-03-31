import { RouteProp, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TextInput, View } from 'react-native';

import { GradientButton } from '../../components/GradientButton';
import { ThemedText } from '../../components/Themed';
import { useRegister } from '../../hooks/useAuthActions';
import { useAuth } from '../../providers/AuthProvider';
import { colors, radius } from '../../theme';
import { buildUsername, formatLocalPhone, normalizePhoneToE164 } from './onboarding';
import { AuthStackParamList } from '../../navigation/types';

export const OnboardingBiodataScreen: React.FC = () => {
  const route = useRoute<RouteProp<AuthStackParamList, 'OnboardingBiodata'>>();
  const { email } = route.params;
  const hasContext = Boolean(email);
  const { login } = useAuth();
  const register = useRegister(() => undefined);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [phoneInput, setPhoneInput] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [usePhoneAsAccountNumber, setUsePhoneAsAccountNumber] = useState(true);
  const [localError, setLocalError] = useState<string | null>(null);

  const username = useMemo(() => buildUsername(firstName || 'user', lastName || 'demo'), [firstName, lastName]);
  const phoneDisplay = useMemo(() => formatLocalPhone(phoneInput), [phoneInput]);
  const phoneE164 = useMemo(() => normalizePhoneToE164(phoneInput), [phoneInput]);

  const createAccount = () => {
    if (!hasContext) {
      setLocalError('Email session missing. Restart onboarding.');
      return;
    }
    if (!firstName.trim() || !lastName.trim()) {
      setLocalError('First name and last name are required');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      setLocalError('Date of birth must be YYYY-MM-DD');
      return;
    }
    if (!phoneE164) {
      setLocalError('Enter a valid 11-digit Nigerian phone number');
      return;
    }
    if (password.length < 8) {
      setLocalError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setLocalError('Passwords do not match');
      return;
    }

    setLocalError(null);

    register.mutate(
      {
        phoneNumber: phoneE164,
        email,
        username,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password,
        usePhoneAsAccountNumber
      },
      {
        onSuccess: async (payload: any) => {
          await login(payload.tokens);
        }
      }
    );
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>Basic Details</ThemedText>
      <ThemedText style={styles.subtitle}>Verified email: {email}</ThemedText>
      <ThemedText style={styles.hint}>KYC is optional for now and can be completed later.</ThemedText>

      <TextInput
        value={firstName}
        onChangeText={setFirstName}
        placeholder="First name"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <TextInput
        value={lastName}
        onChangeText={setLastName}
        placeholder="Last name"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <TextInput
        value={phoneInput}
        onChangeText={(value) => setPhoneInput(value.replace(/\D/g, '').slice(0, 11))}
        placeholder="Phone number (11 digits, e.g. 07031234567)"
        placeholderTextColor={colors.textSecondary}
        keyboardType="phone-pad"
        style={styles.input}
      />
      <ThemedText style={styles.hint}>Phone preview: {phoneDisplay || '0___ ___ ____'}</ThemedText>
      <TextInput
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="Date of birth (YYYY-MM-DD)"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <TextInput
        value={password}
        onChangeText={setPassword}
        placeholder="Create password (min 8 chars)"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        style={styles.input}
      />
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        placeholder="Confirm password"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        style={styles.input}
      />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.switchTitle}>Use phone as account number</ThemedText>
          <ThemedText style={styles.switchSub}>If OFF, system generates 10-digit account number.</ThemedText>
        </View>
        <Switch value={usePhoneAsAccountNumber} onValueChange={setUsePhoneAsAccountNumber} />
      </View>

      <ThemedText style={styles.hint}>Auto username preview: {username}</ThemedText>

      {(localError || register.error) && (
        <ThemedText style={styles.error}>
          {localError || (register.error as Error | undefined)?.message}
        </ThemedText>
      )}

      {register.isPending ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 14 }} />
      ) : (
        <GradientButton
          title="Create Account"
          onPress={createAccount}
          style={styles.cta}
          disabled={!hasContext || register.isPending}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
    paddingTop: 40,
    backgroundColor: colors.bg,
    gap: 10
  },
  title: {
    fontSize: 28,
    fontWeight: '800'
  },
  subtitle: {
    color: colors.textSecondary,
    marginBottom: 8
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  switchRow: {
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center',
    marginTop: 4
  },
  switchTitle: {
    fontWeight: '700'
  },
  switchSub: {
    color: colors.textSecondary,
    fontSize: 12
  },
  hint: {
    color: colors.textSecondary,
    fontSize: 12
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
