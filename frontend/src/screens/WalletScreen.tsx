import React, { useState } from 'react';
import { ActivityIndicator, Alert, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { useWallets, useWalletAccountNumber } from '../hooks/useWallets';
import { useP2PTransfer, useBankTransfer } from '../hooks/useMutations';
import { GradientButton } from '../components/GradientButton';
import { GlassCard } from '../components/GlassCard';
import { colors, radius } from '../theme';

function toPositiveInt(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export const WalletScreen: React.FC = () => {
  const { session } = useAuth();
  const { data, isLoading, isError, refetch } = useWallets(session?.accessToken);
  const { data: canonicalAccount } = useWalletAccountNumber(session?.accessToken, 'NGN');
  const p2p = useP2PTransfer(session?.accessToken);
  const bank = useBankTransfer(session?.accessToken);

  const [p2pForm, setP2pForm] = useState({
    recipientIdentifier: '',
    amountMinor: '',
    currency: 'NGN',
    description: ''
  });

  const [bankForm, setBankForm] = useState({
    bankCode: '',
    accountNumber: '',
    amountMinor: '',
    currency: 'NGN',
    narration: ''
  });

  const totalBalance = data?.reduce((sum: number, w: any) => sum + Number(w.balanceMinor || 0), 0) ?? 0;

  const onP2PTransfer = () => {
    const amountMinor = toPositiveInt(p2pForm.amountMinor);
    if (!p2pForm.recipientIdentifier.trim()) {
      Alert.alert('Validation', 'Recipient is required.');
      return;
    }
    if (!amountMinor) {
      Alert.alert('Validation', 'Amount must be a positive number.');
      return;
    }
    p2p.mutate({
      recipientIdentifier: p2pForm.recipientIdentifier.trim(),
      amountMinor,
      currency: p2pForm.currency,
      description: p2pForm.description || undefined
    });
  };

  const onBankTransfer = () => {
    const amountMinor = toPositiveInt(bankForm.amountMinor);
    if (!bankForm.bankCode.trim()) {
      Alert.alert('Validation', 'Bank code is required.');
      return;
    }
    if (!bankForm.accountNumber.trim()) {
      Alert.alert('Validation', 'Account number is required.');
      return;
    }
    if (!amountMinor) {
      Alert.alert('Validation', 'Amount must be a positive number.');
      return;
    }
    bank.mutate({
      bankCode: bankForm.bankCode.trim(),
      accountNumber: bankForm.accountNumber.trim(),
      amountMinor,
      currency: bankForm.currency,
      narration: bankForm.narration || undefined
    });
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#fff" />}
    >
      <ThemedText style={styles.heading}>Wallet</ThemedText>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Primary Account Number</ThemedText>
        <ThemedText style={styles.accountNumberHero}>
          {canonicalAccount?.accountNumber ?? 'Not available yet'}
        </ThemedText>
      </GlassCard>

      <GlassCard style={styles.heroCard}>
        <ThemedText style={styles.kicker}>Total Balance</ThemedText>
        <ThemedText style={styles.bigBalance}>{'\u20A6'} {totalBalance.toLocaleString()}</ThemedText>
        <View style={styles.balancePills}>
          {!isLoading &&
            data?.map((w: any) => (
              <View key={w.id} style={styles.pill}>
                <ThemedText style={styles.pillLabel}>{w.currency}</ThemedText>
                <ThemedText style={styles.pillValue}>{w.balanceMinor}</ThemedText>
                {w.accountNumber ? (
                  <ThemedText style={styles.accountNumber}>Acct: {w.accountNumber}</ThemedText>
                ) : null}
              </View>
            ))}
        </View>
      </GlassCard>

      {isError && (
        <GlassCard style={{ marginTop: 16 }}>
          <ThemedText style={styles.error}>Failed to load wallet balances.</ThemedText>
        </GlassCard>
      )}

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Send to User (P2P)</ThemedText>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Recipient</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Email, phone, or @username"
            placeholderTextColor={colors.textSecondary}
            value={p2pForm.recipientIdentifier}
            onChangeText={(t) => setP2pForm({ ...p2pForm, recipientIdentifier: t })}
          />
        </View>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Amount (minor)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g. 100000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={p2pForm.amountMinor}
              onChangeText={(t) => setP2pForm({ ...p2pForm, amountMinor: t })}
            />
          </View>
          <View style={{ width: 90 }}>
            <ThemedText style={styles.label}>Currency</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="NGN"
              placeholderTextColor={colors.textSecondary}
              value={p2pForm.currency}
              onChangeText={(t) => setP2pForm({ ...p2pForm, currency: t.toUpperCase() })}
            />
          </View>
        </View>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Description</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Narration"
            placeholderTextColor={colors.textSecondary}
            value={p2pForm.description}
            onChangeText={(t) => setP2pForm({ ...p2pForm, description: t })}
          />
        </View>
        {p2p.isError && <ThemedText style={styles.error}>{(p2p.error as Error).message}</ThemedText>}
        {p2p.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton title="Send" onPress={onP2PTransfer} style={{ marginTop: 10 }} />
        )}
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 16 }}>
        <ThemedText style={styles.sectionTitle}>Transfer to Bank</ThemedText>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Bank Code</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="058"
              placeholderTextColor={colors.textSecondary}
              value={bankForm.bankCode}
              onChangeText={(t) => setBankForm({ ...bankForm, bankCode: t })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Account Number</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="0123456789"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={bankForm.accountNumber}
              onChangeText={(t) => setBankForm({ ...bankForm, accountNumber: t })}
            />
          </View>
        </View>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Amount (minor)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="100000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={bankForm.amountMinor}
              onChangeText={(t) => setBankForm({ ...bankForm, amountMinor: t })}
            />
          </View>
          <View style={{ width: 90 }}>
            <ThemedText style={styles.label}>Currency</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="NGN"
              placeholderTextColor={colors.textSecondary}
              value={bankForm.currency}
              onChangeText={(t) => setBankForm({ ...bankForm, currency: t.toUpperCase() })}
            />
          </View>
        </View>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Narration</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Invoice 204, thanks!"
            placeholderTextColor={colors.textSecondary}
            value={bankForm.narration}
            onChangeText={(t) => setBankForm({ ...bankForm, narration: t })}
          />
        </View>
        {bank.isError && <ThemedText style={styles.error}>{(bank.error as Error).message}</ThemedText>}
        {bank.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton title="Transfer to Bank" onPress={onBankTransfer} style={{ marginTop: 10 }} />
        )}
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  heroCard: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: radius.xl
  },
  kicker: { color: colors.textSecondary, fontSize: 13, marginBottom: 6 },
  bigBalance: { fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  accountNumberHero: { fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  balancePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.border
  },
  pillLabel: { fontSize: 12, color: colors.textSecondary },
  pillValue: { fontWeight: '700' },
  accountNumber: { marginTop: 4, fontSize: 11, color: colors.textSecondary },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  formGroup: { marginTop: 10 },
  formGroupRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  label: { color: colors.textSecondary, marginBottom: 6 },
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
