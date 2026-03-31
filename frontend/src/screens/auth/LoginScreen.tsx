import { useNavigation } from '@react-navigation/native';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { GradientButton } from '../../components/GradientButton';
import { ThemedText } from '../../components/Themed';
import { useLogin } from '../../hooks/useAuthActions';
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
  error: {
    color: 'tomato'
  }
});
