import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { useSavingsVaults } from '../hooks/useSavingsVaults';
import { useSavingsCreateVault, useSavingsDeposit, useSavingsWithdraw } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';

function toPositiveInt(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export const SavingsScreen: React.FC = () => {
  const { session } = useAuth();
  const { data: vaults, isLoading, isError } = useSavingsVaults(session?.accessToken);
  const createVault = useSavingsCreateVault(session?.accessToken);
  const deposit = useSavingsDeposit(session?.accessToken);
  const withdraw = useSavingsWithdraw(session?.accessToken);

  const [amount, setAmount] = useState('0');
  const [selectedVaultId, setSelectedVaultId] = useState('');
  const [newVaultName, setNewVaultName] = useState('');
  const [newVaultTarget, setNewVaultTarget] = useState('');

  const list = vaults ?? [];
  const selectedVault = useMemo(
    () => list.find((vault: any) => vault.id === selectedVaultId) ?? null,
    [list, selectedVaultId]
  );

  const totalBalance =
    list.reduce((sum: number, vault: any) => sum + Number(vault.balanceMinor || 0), 0) ?? 0;

  const onCreateVault = () => {
    const targetAmountMinor = toPositiveInt(newVaultTarget);
    if (!newVaultName.trim()) {
      Alert.alert('Validation', 'Vault name is required.');
      return;
    }
    if (!targetAmountMinor) {
      Alert.alert('Validation', 'Target amount must be a positive number.');
      return;
    }
    createVault.mutate({
      name: newVaultName.trim(),
      currency: 'NGN',
      targetAmountMinor
    });
  };

  const onDeposit = () => {
    const amountMinor = toPositiveInt(amount);
    if (!selectedVaultId) {
      Alert.alert('Validation', 'Select a vault first.');
      return;
    }
    if (!amountMinor) {
      Alert.alert('Validation', 'Amount must be a positive number.');
      return;
    }
    deposit.mutate({
      vaultId: selectedVaultId,
      currency: 'NGN',
      amountMinor,
      reference: `dep-${Date.now()}`
    });
  };

  const onWithdraw = () => {
    const amountMinor = toPositiveInt(amount);
    if (!selectedVaultId) {
      Alert.alert('Validation', 'Select a vault first.');
      return;
    }
    if (!amountMinor) {
      Alert.alert('Validation', 'Amount must be a positive number.');
      return;
    }
    withdraw.mutate({
      vaultId: selectedVaultId,
      currency: 'NGN',
      amountMinor,
      reference: `wd-${Date.now()}`
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>My Savings</ThemedText>

      <GlassCard style={styles.hero}>
        <ThemedText style={styles.kicker}>TOTAL BALANCE</ThemedText>
        <ThemedText style={styles.bigBalance}>{'\u20A6'} {totalBalance.toLocaleString()}</ThemedText>
      </GlassCard>

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Create Vault</ThemedText>
        <ThemedText style={styles.label}>Vault name</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Emergency Fund"
          placeholderTextColor={colors.textSecondary}
          value={newVaultName}
          onChangeText={setNewVaultName}
        />
        <ThemedText style={styles.label}>Target amount (minor)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="500000"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          value={newVaultTarget}
          onChangeText={setNewVaultTarget}
        />
        {createVault.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton title="Create Vault" onPress={onCreateVault} style={{ marginTop: 10 }} />
        )}
        {createVault.error && <ThemedText style={styles.error}>{(createVault.error as Error).message}</ThemedText>}
      </GlassCard>

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Your Vaults</ThemedText>
        {isLoading && <ActivityIndicator color={colors.accent} />}
        {isError && <ThemedText style={styles.error}>Failed to load vaults</ThemedText>}
        {!isLoading && list.length === 0 && (
          <ThemedText style={styles.muted}>No vault yet. Create one above.</ThemedText>
        )}
        {list.map((vault: any) => {
          const pct = vault.targetAmountMinor
            ? Math.min(100, Math.round((vault.balanceMinor / vault.targetAmountMinor) * 100))
            : 0;
          return (
            <View key={vault.id} style={styles.vaultRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="shield-checkmark" size={18} color={colors.textPrimary} />
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.vaultTitle}>{vault.name}</ThemedText>
                  <ThemedText style={styles.vaultSub}>
                    {'\u20A6'}
                    {Number(vault.balanceMinor).toLocaleString()} / {'\u20A6'}
                    {Number(vault.targetAmountMinor).toLocaleString()} ({pct}%)
                  </ThemedText>
                </View>
              </View>
              <GradientButton
                title={selectedVaultId === vault.id ? 'Selected' : 'Select'}
                onPress={() => setSelectedVaultId(vault.id)}
              />
            </View>
          );
        })}
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 24 }}>
        <ThemedText style={styles.sectionTitle}>Quick Transaction</ThemedText>
        <ThemedText style={styles.muted}>
          Selected vault: {selectedVault ? selectedVault.name : 'None'}
        </ThemedText>
        <ThemedText style={styles.label}>Amount (minor)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="100000"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          value={amount}
          onChangeText={setAmount}
        />
        <View style={styles.btnRow}>
          {deposit.isPending ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <GradientButton title="Deposit" onPress={onDeposit} style={{ flex: 1 }} />
          )}
          {withdraw.isPending ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <GradientButton title="Withdraw" onPress={onWithdraw} style={{ flex: 1 }} />
          )}
        </View>
        {(deposit.error || withdraw.error) && (
          <ThemedText style={styles.error}>
            {(deposit.error as Error | undefined)?.message || (withdraw.error as Error | undefined)?.message}
          </ThemedText>
        )}
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  hero: {
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: radius.xl,
    alignItems: 'center',
    paddingVertical: 20
  },
  kicker: { color: colors.textSecondary, fontSize: 13 },
  bigBalance: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5, marginTop: 6 },
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
  muted: { color: colors.textSecondary },
  vaultRow: {
    marginTop: 10,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  vaultTitle: { fontWeight: '700', fontSize: 15 },
  vaultSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  error: { color: 'tomato', marginTop: 8 }
});
