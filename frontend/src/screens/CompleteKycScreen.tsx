import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';

import { apiPost } from '../api/client';
import { GradientButton } from '../components/GradientButton';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { colors, radius } from '../theme';

export const CompleteKycScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const token = session?.accessToken;

  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitKyc = async () => {
    if (!token) {
      setError('You are not logged in. Please sign in again.');
      return;
    }
    if (!/^\d{11}$/.test(bvn)) {
      setError('BVN must be 11 digits');
      return;
    }
    if (!/^\d{11}$/.test(nin)) {
      setError('NIN must be 11 digits');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) {
      setError('Date of birth must be YYYY-MM-DD');
      return;
    }
    if (!address.trim()) {
      setError('Address is required');
      return;
    }

    try {
      setLoading(true);
      setError(null);
      await apiPost(
        '/kyc/verify',
        {
          bvn,
          nin,
          dateOfBirth,
          address: address.trim()
        },
        token
      );
      navigation.navigate('CompleteLiveness');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>Complete KYC</ThemedText>
      <ThemedText style={styles.subtitle}>
        Submit your identity details now. You can skip this and continue using Tier 0 limits.
      </ThemedText>

      <TextInput
        value={bvn}
        onChangeText={(value) => setBvn(value.replace(/\D/g, '').slice(0, 11))}
        keyboardType="number-pad"
        placeholder="BVN (11 digits)"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <TextInput
        value={nin}
        onChangeText={(value) => setNin(value.replace(/\D/g, '').slice(0, 11))}
        keyboardType="number-pad"
        placeholder="NIN (11 digits)"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <TextInput
        value={dateOfBirth}
        onChangeText={setDateOfBirth}
        placeholder="Date of birth (YYYY-MM-DD)"
        placeholderTextColor={colors.textSecondary}
        style={styles.input}
      />
      <TextInput
        value={address}
        onChangeText={setAddress}
        placeholder="Residential address"
        placeholderTextColor={colors.textSecondary}
        style={[styles.input, styles.textArea]}
        multiline
      />

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      {loading ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
      ) : (
        <>
          <GradientButton title="Submit KYC" onPress={submitKyc} style={styles.cta} />
          <GradientButton
            title="Do This Later"
            onPress={() => navigation.goBack()}
            style={styles.ctaSecondary}
          />
        </>
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
  textArea: {
    minHeight: 94,
    textAlignVertical: 'top'
  },
  error: {
    color: '#ff8f8f',
    marginTop: 4
  },
  cta: {
    marginTop: 'auto',
    marginBottom: 8
  },
  ctaSecondary: {
    marginBottom: 8
  }
});
