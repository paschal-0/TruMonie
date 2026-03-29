import React, { useState } from 'react';
import { View, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { ThemedText } from '../../components/Themed';
import { useRegister } from '../../hooks/useAuthActions';
import { useAuth } from '../../providers/AuthProvider';
import { GradientButton } from '../../components/GradientButton';
import { colors, radius } from '../../theme';

export const RegisterScreen: React.FC = () => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [username, setUsername] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const { mutate, isLoading, error } = useRegister((data) =>
    login({ accessToken: data.tokens.accessToken, refreshToken: data.tokens.refreshToken })
  );

  return (
    <View style={styles.container}>
      <ThemedText style={styles.heading}>Create Account</ThemedText>
      <ThemedText style={styles.sub}>Join TruMoni. Secure wallet, bills, Ajo, and more.</ThemedText>
      <TextInput
        placeholder="Email"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={email}
        onChangeText={setEmail}
      />
      <TextInput
        placeholder="Phone"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={phoneNumber}
        onChangeText={setPhoneNumber}
      />
      <TextInput
        placeholder="Username"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={username}
        onChangeText={setUsername}
        autoCapitalize="none"
      />
      <TextInput
        placeholder="First Name"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={firstName}
        onChangeText={setFirstName}
      />
      <TextInput
        placeholder="Last Name"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={lastName}
        onChangeText={setLastName}
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
        <GradientButton
          title="Register"
          onPress={() =>
            mutate({
              email,
              phoneNumber,
              username,
              firstName,
              lastName,
              password
            })
          }
          style={{ marginTop: 10 }}
        />
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
