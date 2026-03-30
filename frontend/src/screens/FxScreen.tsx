import React, { useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { useFxRate } from '../hooks/useFxRate';
import { useFxConvert, useFxQuote } from '../hooks/useMutations';
import { useAuth } from '../providers/AuthProvider';
import { Currency } from '../types';
import { colors, radius } from '../theme';
import { useSetTransactionPin, useTransactionPinStatus } from '../hooks/useTransactionPin';

export const FxScreen: React.FC = () => {
  const base: Currency = 'USD';
  const quote: Currency = 'NGN';
  const [amount, setAmount] = useState('1000');
  const { data } = useFxRate(base, quote);
  const { session } = useAuth();
  const { data: pinStatus } = useTransactionPinStatus(session?.accessToken);
  const setPinMutation = useSetTransactionPin(session?.accessToken);
  const quoteMutation = useFxQuote(session?.accessToken);
  const convertMutation = useFxConvert(session?.accessToken);
  const [pin, setPin] = useState('');
  const [pinSetup, setPinSetup] = useState('');

  const rate = data?.rate ?? 0;
  const receiveAmount = rate * Number(amount || 0);
  const running = quoteMutation.status === 'pending' || convertMutation.status === 'pending';

  const onPreviewExchange = async () => {
    const normalizedAmount = Number(amount);
    if (!Number.isFinite(normalizedAmount) || normalizedAmount <= 0) return;
    if (!pinStatus?.hasTransactionPin) {
      Alert.alert('Transaction PIN Required', 'Create your 4-digit transaction PIN first.');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      Alert.alert('Validation', 'Enter your 4-digit transaction PIN.');
      return;
    }

    const fxQuote = await quoteMutation.mutateAsync({
      base,
      quote,
      amountMinor: normalizedAmount
    });

    await convertMutation.mutateAsync({
      quoteId: fxQuote.id,
      base,
      quote,
      amountMinor: normalizedAmount,
      pin
    });
    Alert.alert('Success', 'FX conversion completed.');
    setPin('');
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>Exchange</ThemedText>

      <GlassCard style={styles.rateCard}>
        <View style={styles.rateRow}>
          <View>
            <ThemedText style={styles.pairLabel}>
              {base} / {quote}
            </ThemedText>
            <ThemedText style={styles.rateValue}>{rate}</ThemedText>
            <View style={styles.pill}>
              <Ionicons name="trending-up-outline" size={14} color="#22c55e" />
              <ThemedText style={styles.pillText}>+0.45%</ThemedText>
              <ThemedText style={styles.subdued}>Updated just now</ThemedText>
            </View>
          </View>
          <Image
            source={{
              uri: 'https://images.unsplash.com/photo-1520607162513-77705c0f0d4a?auto=format&fit=crop&w=200&q=80'
            }}
            style={styles.thumb}
          />
        </View>
      </GlassCard>

      <GlassCard style={styles.panel}>
        <View style={styles.panelHeader}>
          <ThemedText style={styles.label}>You Send</ThemedText>
          <ThemedText style={styles.subdued}>Balance: $12,450.00</ThemedText>
        </View>
        <View style={styles.amountRow}>
          <ThemedText style={styles.currencySymbol}>{base}</ThemedText>
          <TextInput style={styles.amountInput} keyboardType="number-pad" value={amount} onChangeText={setAmount} />
          <View style={styles.currencyPill}>
            <ThemedText style={styles.currencyText}>{base}</ThemedText>
            <Ionicons name="chevron-down" size={16} color={colors.textPrimary} />
          </View>
        </View>
      </GlassCard>

      <View style={styles.switch}>
        <Ionicons name="swap-vertical" size={22} color={colors.textPrimary} />
      </View>

      <GlassCard style={styles.panel}>
        <View style={styles.panelHeader}>
          <ThemedText style={styles.label}>You Receive</ThemedText>
          <View style={styles.noFees}>
            <ThemedText style={styles.noFeesText}>NO FEES</ThemedText>
          </View>
        </View>
        <View style={styles.amountRow}>
          <ThemedText style={[styles.currencySymbol, { color: '#22c55e' }]}>{quote}</ThemedText>
          <ThemedText style={[styles.amountInput, { paddingTop: 6 }]}>
            {receiveAmount.toLocaleString(undefined, {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2
            })}
          </ThemedText>
          <View style={styles.currencyPill}>
            <ThemedText style={styles.currencyText}>{quote}</ThemedText>
            <Ionicons name="chevron-down" size={16} color={colors.textPrimary} />
          </View>
        </View>
      </GlassCard>

      <GlassCard style={styles.metaCard}>
        {!pinStatus?.hasTransactionPin ? (
          <View style={{ marginBottom: 8 }}>
            <ThemedText style={styles.error}>Transaction PIN not set.</ThemedText>
            <TextInput
              style={styles.pinInput}
              placeholder="Create 4-digit PIN"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={pinSetup}
              onChangeText={setPinSetup}
            />
            {setPinMutation.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton
                title="Create PIN"
                onPress={() => {
                  if (!/^\d{4}$/.test(pinSetup)) {
                    Alert.alert('Validation', 'PIN must be exactly 4 digits.');
                    return;
                  }
                  setPinMutation.mutate({ pin: pinSetup }, { onSuccess: () => setPinSetup('') });
                }}
                style={{ marginTop: 8 }}
              />
            )}
          </View>
        ) : null}
        <View style={styles.metaRow}>
          <ThemedText style={styles.metaLabel}>Rate</ThemedText>
          <ThemedText style={styles.metaValue}>
            1 {base} = {rate} {quote}
          </ThemedText>
        </View>
        <View style={styles.metaRow}>
          <ThemedText style={styles.metaLabel}>Fee</ThemedText>
          <ThemedText
            style={[
              styles.metaValue,
              { color: colors.textSecondary, textDecorationLine: 'line-through' }
            ]}
          >
            $2.50
          </ThemedText>
          <ThemedText style={[styles.metaValue, { color: colors.accent, marginLeft: 6 }]}>Free</ThemedText>
        </View>
        <View style={styles.metaRow}>
          <ThemedText style={styles.metaLabel}>Execution Time</ThemedText>
          <ThemedText style={styles.metaValue}>~ 2 Seconds</ThemedText>
        </View>
        <View style={styles.metaRow}>
          <ThemedText style={styles.metaLabel}>Transaction PIN</ThemedText>
          <TextInput
            style={styles.pinInput}
            placeholder="4-digit PIN"
            placeholderTextColor={colors.textSecondary}
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            value={pin}
            onChangeText={setPin}
          />
        </View>
      </GlassCard>

      {running ? (
        <ActivityIndicator color={colors.accent} style={{ marginTop: 18 }} />
      ) : (
        <GradientButton title="Preview Exchange" onPress={() => void onPreviewExchange()} style={styles.cta} />
      )}

      {(quoteMutation.error || convertMutation.error) && (
        <ThemedText style={styles.error}>
          {(quoteMutation.error as Error | undefined)?.message ||
            (convertMutation.error as Error | undefined)?.message}
        </ThemedText>
      )}

      <ThemedText style={styles.footerNote}>Quotes update every 30 seconds</ThemedText>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, backgroundColor: colors.bg },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 8
  },
  rateCard: { padding: 18, borderRadius: radius.xl, backgroundColor: 'rgba(0,0,0,0.12)' },
  rateRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  pairLabel: { color: colors.textSecondary, fontSize: 14, marginBottom: 4 },
  rateValue: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  pill: {
    marginTop: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(79,224,193,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  pillText: { color: colors.textPrimary, fontWeight: '700' },
  subdued: { color: colors.textSecondary, fontSize: 13 },
  thumb: { width: 90, height: 90, borderRadius: 24, backgroundColor: 'rgba(255,255,255,0.06)' },
  panel: { marginTop: 16 },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  label: { color: colors.textSecondary, fontSize: 14 },
  amountRow: { flexDirection: 'row', alignItems: 'center', marginTop: 12, gap: 10 },
  currencySymbol: { fontSize: 22, fontWeight: '800', color: colors.textPrimary },
  amountInput: { flex: 1, fontSize: 32, fontWeight: '800', color: colors.textPrimary, paddingVertical: 6 },
  currencyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  currencyText: { fontWeight: '800' },
  switch: {
    alignSelf: 'center',
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: 'rgba(255,255,255,0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
    borderWidth: 1,
    borderColor: colors.border
  },
  noFees: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    backgroundColor: 'rgba(79,224,193,0.15)'
  },
  noFeesText: { color: colors.textPrimary, fontWeight: '700', fontSize: 12 },
  metaCard: { marginTop: 16, paddingVertical: 12, gap: 12 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  metaLabel: { color: colors.textSecondary, fontSize: 14, flex: 1 },
  metaValue: { color: colors.textPrimary, fontWeight: '700' },
  cta: { marginTop: 18, marginBottom: 12 },
  footerNote: { textAlign: 'center', color: colors.textSecondary, marginTop: 4 },
  error: { color: 'tomato', marginTop: 8 },
  pinInput: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)',
    minWidth: 120
  }
});
