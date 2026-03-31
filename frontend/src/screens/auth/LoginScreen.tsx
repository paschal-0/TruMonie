import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GradientButton } from '../../components/GradientButton';
import { ThemedText } from '../../components/Themed';
import { useLogin, useSendOtp, useVerifyOtp } from '../../hooks/useAuthActions';
import {
  clearBiometricLoginCredentials,
  getBiometricLoginCredentials,
  getBiometricLoginEnabled,
  getBiometricLoginReady,
  isBiometricLoginAvailable,
  promptBiometric,
  saveBiometricLoginCredentials,
  setBiometricLoginEnabled
} from '../../lib/biometricLogin';
import { useAuth } from '../../providers/AuthProvider';
import { colors, radius } from '../../theme';
import { AuthStackParamList } from '../../navigation/types';

export const LoginScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Login'>>();
  const { login } = useAuth();

  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabledState] = useState(false);
  const [biometricReady, setBiometricReady] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [otpEmail, setOtpEmail] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpLocalError, setOtpLocalError] = useState<string | null>(null);

  const { mutate, isPending, error } = useLogin(async (data) => {
    await login({ accessToken: data.tokens.accessToken, refreshToken: data.tokens.refreshToken });
    if (biometricAvailable && biometricEnabled && identifier && password) {
      await saveBiometricLoginCredentials(identifier.trim(), password);
      await setBiometricLoginEnabled(true);
      setBiometricReady(true);
      return;
    }
    if (!biometricEnabled) {
      await clearBiometricLoginCredentials();
      setBiometricReady(false);
    }
  });
  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();

  useEffect(() => {
    const load = async () => {
      const available = await isBiometricLoginAvailable();
      setBiometricAvailable(available);
      if (!available) return;
      const enabled = await getBiometricLoginEnabled();
      setBiometricEnabledState(enabled);
      const ready = await getBiometricLoginReady();
      setBiometricReady(ready);
    };
    void load();
  }, []);

  const onPasswordLogin = () => {
    setLocalError(null);
    mutate({ identifier: identifier.trim(), password });
  };

  const onSendOtp = () => {
    const email = otpEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setOtpLocalError('Enter a valid email address');
      return;
    }
    setOtpLocalError(null);
    sendOtp.mutate(
      { destination: email, purpose: 'LOGIN', channel: 'email' },
      {
        onSuccess: () => setOtpSent(true)
      }
    );
  };

  const onVerifyOtpLogin = () => {
    const email = otpEmail.trim().toLowerCase();
    if (!otpSent) {
      setOtpLocalError('Send OTP first');
      return;
    }
    if (otpCode.length !== 6) {
      setOtpLocalError('Enter a valid 6-digit OTP');
      return;
    }
    setOtpLocalError(null);
    verifyOtp.mutate(
      { destination: email, purpose: 'LOGIN', code: otpCode },
      {
        onSuccess: async (payload: any) => {
          if (!payload?.verified || !payload?.accessToken || !payload?.refreshToken) {
            setOtpLocalError('OTP login failed');
            return;
          }
          await login({ accessToken: payload.accessToken, refreshToken: payload.refreshToken });
        }
      }
    );
  };

  const onBiometricLogin = async () => {
    setLocalError(null);
    if (!biometricAvailable) {
      setLocalError('Biometric authentication is not available on this device.');
      return;
    }
    const auth = await promptBiometric('Authenticate to login');
    if (!auth.success) {
      setLocalError('Biometric authentication was cancelled or failed.');
      return;
    }
    const creds = await getBiometricLoginCredentials();
    if (!creds) {
      setLocalError('No saved biometric login credentials. Login with password first.');
      return;
    }
    mutate({ identifier: creds.identifier, password: creds.password });
  };

  const toggleBiometricChoice = async (enabled: boolean) => {
    setBiometricEnabledState(enabled);
    await setBiometricLoginEnabled(enabled);
    if (!enabled) {
      await clearBiometricLoginCredentials();
      setBiometricReady(false);
    }
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.heading}>Login</ThemedText>
      <ThemedText style={styles.sub}>Use password login, or biometrics if you enabled it earlier.</ThemedText>

      <TextInput
        placeholder="Email or phone"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={identifier}
        onChangeText={setIdentifier}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="Password"
        placeholderTextColor={colors.textSecondary}
        secureTextEntry
        style={styles.input}
        value={password}
        onChangeText={setPassword}
      />

      <View style={styles.switchRow}>
        <View style={{ flex: 1 }}>
          <ThemedText style={styles.switchTitle}>Enable biometric login</ThemedText>
          <ThemedText style={styles.switchSub}>Save credentials securely for fingerprint/face login.</ThemedText>
        </View>
        <Switch
          value={biometricEnabled}
          onValueChange={(next) => {
            void toggleBiometricChoice(next);
          }}
          disabled={!biometricAvailable}
        />
      </View>

      {(localError || error) && (
        <ThemedText style={styles.error}>{localError || (error as Error).message}</ThemedText>
      )}

      {isPending ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <>
          <GradientButton title="Login with Password" onPress={onPasswordLogin} style={{ marginTop: 10 }} />
          <GradientButton
            title="Login with Biometrics"
            onPress={onBiometricLogin}
            style={{ marginTop: 10 }}
            disabled={!biometricAvailable || !biometricReady}
          />
          <GradientButton
            title="Create New Account"
            onPress={() => navigation.navigate('OnboardingPhone')}
            style={{ marginTop: 10 }}
          />
          <View style={styles.divider} />
          <ThemedText style={styles.sub}>
            Existing account without password? Use email OTP login, then set password in Settings.
          </ThemedText>
          <TextInput
            placeholder="Email for OTP login"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={otpEmail}
            onChangeText={setOtpEmail}
            autoCapitalize="none"
          />
          <TextInput
            placeholder="6-digit OTP"
            placeholderTextColor={colors.textSecondary}
            style={styles.input}
            value={otpCode}
            onChangeText={setOtpCode}
            keyboardType="number-pad"
            maxLength={6}
          />
          {(otpLocalError || sendOtp.error || verifyOtp.error) && (
            <ThemedText style={styles.error}>
              {otpLocalError ||
                (sendOtp.error as Error | undefined)?.message ||
                (verifyOtp.error as Error | undefined)?.message}
            </ThemedText>
          )}
          {sendOtp.isPending || verifyOtp.isPending ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <>
              <GradientButton
                title={otpSent ? 'Resend OTP' : 'Send OTP'}
                onPress={onSendOtp}
                style={{ marginTop: 8 }}
              />
              <GradientButton title="Login with OTP" onPress={onVerifyOtpLogin} style={{ marginTop: 8 }} />
            </>
          )}
        </>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, padding: 18, gap: 12, justifyContent: 'center', backgroundColor: colors.bg },
  heading: { fontSize: 28, fontWeight: '800', marginBottom: 6, color: colors.textPrimary },
  sub: { color: colors.textSecondary, marginBottom: 12 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  switchRow: {
    marginTop: 6,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    gap: 10,
    alignItems: 'center'
  },
  switchTitle: { fontWeight: '700', color: colors.textPrimary, marginBottom: 2 },
  switchSub: { color: colors.textSecondary, fontSize: 12 },
  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginTop: 14,
    marginBottom: 6
  },
  error: {
    color: 'tomato'
  }
});
