import React, { useState } from 'react';
import { View, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { useAuth } from '../../providers/AuthProvider';
import { ThemedText } from '../../components/Themed';
import { useLogin } from '../../hooks/useAuthActions';
import { GradientButton } from '../../components/GradientButton';
import { colors, radius } from '../../theme';

export const LoginScreen: React.FC = () => {
  const { login } = useAuth();
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const { mutate, isLoading, error } = useLogin((data) =>
    login({ accessToken: data.tokens.accessToken, refreshToken: data.tokens.refreshToken })
  );

  return (
    <View style={styles.container}>
      <ThemedText style={styles.heading}>Login</ThemedText>
      <ThemedText style={styles.sub}>Welcome back. Securely access your TruMoni account.</ThemedText>
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
      {error && <ThemedText style={styles.error}>{(error as Error).message}</ThemedText>}
      {isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <GradientButton title="Login" onPress={() => mutate({ identifier, password })} style={{ marginTop: 10 }} />
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
  error: {
    color: 'tomato'
  }
});
