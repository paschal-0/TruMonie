import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, TextInput, View } from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { apiPost } from '../../api/client';
import { GradientButton } from '../../components/GradientButton';
import { ThemedText } from '../../components/Themed';
import { colors, radius } from '../../theme';
import { AuthStackParamList } from '../../navigation/types';

export const OnboardingKycScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'OnboardingKyc'>>();
  const route = useRoute<RouteProp<AuthStackParamList, 'OnboardingKyc'>>();
  const params = route.params;
  const hasContext = Boolean(params.tokens?.accessToken && params.dateOfBirth);

  const [bvn, setBvn] = useState('');
  const [nin, setNin] = useState('');
  const [address, setAddress] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submitKyc = async () => {
    if (!hasContext) {
      setError('Onboarding session missing. Restart onboarding.');
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
          dateOfBirth: params.dateOfBirth,
          address: address.trim()
        },
        params.tokens.accessToken
      );

      navigation.navigate('OnboardingLiveness', { ...params });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>KYC Verification</ThemedText>
      <ThemedText style={styles.subtitle}>Provide your BVN, NIN, and residential address.</ThemedText>

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
        <GradientButton
          title="Submit KYC"
          onPress={submitKyc}
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
  }
});
