import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { useRemitInbound, useRemitOutbound } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';

const countries = ['GH', 'US', 'UK', 'KE', 'ZA'];
const etas = ['Instant', '~2 mins', '~5 mins'];

export const RemitScreen: React.FC = () => {
  const { session } = useAuth();
  const outbound = useRemitOutbound(session?.accessToken);
  const inbound = useRemitInbound(session?.accessToken);

  const [outForm, setOutForm] = useState({
    country: '',
    bankCode: '',
    accountNumber: '',
    accountName: '',
    provider: '',
    narration: '',
    amountMinor: '',
    currency: 'NGN'
  });

  const [inForm, setInForm] = useState({
    provider: '',
    reference: '',
    amountMinor: '',
    currency: 'USD'
  });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>Remittance</ThemedText>

      <GlassCard style={styles.hero}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <ThemedText style={styles.kicker}>Send globally</ThemedText>
            <ThemedText style={styles.big}>Fast payouts, transparent fees</ThemedText>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="earth" size={26} color="#fff" />
          </View>
        </View>
      </GlassCard>

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Outbound (Send Abroad)</ThemedText>
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Destination country</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g., GH"
              placeholderTextColor={colors.textSecondary}
              value={outForm.country}
              onChangeText={(t) => setOutForm({ ...outForm, country: t })}
            />
            <View style={styles.chipRow}>
              {countries.map((c) => (
                <View key={c} style={styles.chip}>
                  <Ionicons name="flag-outline" size={12} color={colors.textPrimary} />
                  <ThemedText style={styles.chipText}>{c}</ThemedText>
                </View>
              ))}
            </View>
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Bank code</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="BANK01"
              placeholderTextColor={colors.textSecondary}
              value={outForm.bankCode}
              onChangeText={(t) => setOutForm({ ...outForm, bankCode: t })}
            />
          </View>
        </View>
        <ThemedText style={styles.label}>Account number</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="0123456789"
          placeholderTextColor={colors.textSecondary}
          value={outForm.accountNumber}
          onChangeText={(t) => setOutForm({ ...outForm, accountNumber: t })}
        />
        <ThemedText style={styles.label}>Account name (optional)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="John Doe"
          placeholderTextColor={colors.textSecondary}
          value={outForm.accountName}
          onChangeText={(t) => setOutForm({ ...outForm, accountName: t })}
        />
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Amount (minor)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="500000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={outForm.amountMinor}
              onChangeText={(t) => setOutForm({ ...outForm, amountMinor: t })}
            />
          </View>
          <View style={{ width: 100 }}>
            <ThemedText style={styles.label}>Currency</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="NGN"
              placeholderTextColor={colors.textSecondary}
              value={outForm.currency}
              onChangeText={(t) => setOutForm({ ...outForm, currency: t })}
            />
          </View>
        </View>
        <ThemedText style={styles.label}>Provider (stub)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Provider name"
          placeholderTextColor={colors.textSecondary}
          value={outForm.provider}
          onChangeText={(t) => setOutForm({ ...outForm, provider: t })}
        />
        <ThemedText style={styles.label}>Narration</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Gift to family"
          placeholderTextColor={colors.textSecondary}
          value={outForm.narration}
          onChangeText={(t) => setOutForm({ ...outForm, narration: t })}
        />
        {outbound.error && <ThemedText style={styles.error}>{(outbound.error as Error).message}</ThemedText>}
        {outbound.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton
            title="Send Outbound"
            onPress={() =>
              outbound.mutate({
                amountMinor: Number(outForm.amountMinor),
                currency: outForm.currency,
                provider: outForm.provider,
                narration: outForm.narration,
                destination: {
                  country: outForm.country,
                  bankCode: outForm.bankCode,
                  accountNumber: outForm.accountNumber,
                  accountName: outForm.accountName
                }
              })
            }
            style={{ marginTop: 10 }}
          />
        )}
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 24 }}>
        <ThemedText style={styles.sectionTitle}>Inbound (Receive from Abroad)</ThemedText>
        <ThemedText style={styles.label}>Provider (stub)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Provider"
          placeholderTextColor={colors.textSecondary}
          value={inForm.provider}
          onChangeText={(t) => setInForm({ ...inForm, provider: t })}
        />
        <ThemedText style={styles.label}>Amount (minor)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="100000"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          value={inForm.amountMinor}
          onChangeText={(t) => setInForm({ ...inForm, amountMinor: t })}
        />
        <ThemedText style={styles.label}>Reference (optional)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Ref123"
          placeholderTextColor={colors.textSecondary}
          value={inForm.reference}
          onChangeText={(t) => setInForm({ ...inForm, reference: t })}
        />
        {inbound.error && <ThemedText style={styles.error}>{(inbound.error as Error).message}</ThemedText>}
        {inbound.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton
            title="Request Inbound"
            onPress={() =>
              inbound.mutate({
                amountMinor: Number(inForm.amountMinor),
                currency: inForm.currency,
                provider: inForm.provider,
                reference: inForm.reference
              })
            }
            style={{ marginTop: 10 }}
          />
        )}
        <View style={styles.infoRow}>
          <ThemedText style={styles.metaLabel}>Fees</ThemedText>
          <ThemedText
            style={[styles.metaValue, { textDecorationLine: 'line-through', color: colors.textSecondary }]}
          >
            $2.50
          </ThemedText>
          <ThemedText style={[styles.metaValue, { color: colors.accent, marginLeft: 6 }]}>Free</ThemedText>
        </View>
        <View style={styles.infoRow}>
          <ThemedText style={styles.metaLabel}>ETA</ThemedText>
          <View style={styles.chipRow}>
            {etas.map((e) => (
              <View key={e} style={styles.chip}>
                <Ionicons name="time-outline" size={12} color={colors.textPrimary} />
                <ThemedText style={styles.chipText}>{e}</ThemedText>
              </View>
            ))}
          </View>
        </View>
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  hero: { backgroundColor: 'rgba(0,0,0,0.12)', borderRadius: radius.xl, padding: 16 },
  kicker: { color: colors.textSecondary, fontSize: 13 },
  big: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  heroIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  label: { color: colors.textSecondary, marginTop: 10, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  row: { flexDirection: 'row', gap: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.06)'
  },
  chipText: { color: colors.textPrimary, fontSize: 12, fontWeight: '700' },
  infoRow: { marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  metaLabel: { color: colors.textSecondary, fontSize: 14 },
  metaValue: { color: colors.textPrimary, fontWeight: '700' },
  error: { color: 'tomato', marginTop: 8 }
});
