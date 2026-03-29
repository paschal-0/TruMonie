import React, { useState } from 'react';
import { View, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { ThemedText } from '../../components/Themed';
import { useSendOtp, useVerifyOtp } from '../../hooks/useAuthActions';
import { GradientButton } from '../../components/GradientButton';
import { colors, radius } from '../../theme';

export const OtpScreen: React.FC = () => {
  const [destination, setDestination] = useState('');
  const [purpose, setPurpose] = useState('login');
  const [code, setCode] = useState('');
  const sendOtp = useSendOtp();
  const verifyOtp = useVerifyOtp();

  return (
    <View style={styles.container}>
      <ThemedText style={styles.heading}>Enter OTP</ThemedText>
      <ThemedText style={styles.sub}>We’ll send a 6-digit code to verify.</ThemedText>
      <TextInput
        placeholder="Phone or email"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={destination}
        onChangeText={setDestination}
      />
      <TextInput
        placeholder="Purpose (login)"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        value={purpose}
        onChangeText={setPurpose}
      />
      <GradientButton
        title="Send OTP"
        onPress={() => sendOtp.mutate({ destination, purpose, channel: 'sms' })}
        style={{ marginTop: 8 }}
      />
      <TextInput
        placeholder="6-digit code"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
        keyboardType="number-pad"
        value={code}
        onChangeText={setCode}
      />
      {verifyOtp.isLoading ? (
        <ActivityIndicator color={colors.accent} />
      ) : (
        <GradientButton title="Verify" onPress={() => verifyOtp.mutate({ destination, purpose, code })} style={{ marginTop: 8 }} />
      )}
      {(sendOtp.error || verifyOtp.error) && (
        <ThemedText style={styles.error}>
          {(sendOtp.error as Error | undefined)?.message || (verifyOtp.error as Error | undefined)?.message}
        </ThemedText>
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
  error: { color: 'tomato', marginTop: 8 }
});
