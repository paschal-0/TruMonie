import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { useSavingsVaults } from '../hooks/useSavingsVaults';
import { useSavingsDeposit, useSavingsWithdraw } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';

const icons = ['shield-checkmark', 'car', 'airplane'];
const progressColors = ['#22c55e', '#3b82f6', '#ec4899'];

const demoGoals = [
  { id: 'demo1', name: 'Emergency Fund', description: 'Rainy day savings', balanceMinor: 750000, targetAmountMinor: 1000000 },
  { id: 'demo2', name: 'New Car', description: 'Model Y Goal', balanceMinor: 400000, targetAmountMinor: 1500000 },
  { id: 'demo3', name: 'Bali Trip', description: 'Summer 2024', balanceMinor: 270000, targetAmountMinor: 300000 }
];

export const SavingsScreen: React.FC = () => {
  const { session } = useAuth();
  const { data: vaults, isLoading, isError } = useSavingsVaults(session?.accessToken);
  const deposit = useSavingsDeposit(session?.accessToken);
  const withdraw = useSavingsWithdraw(session?.accessToken);
  const [amount, setAmount] = useState('0');
  const [selectedVault, setSelectedVault] = useState<string | null>(null);

  const hasRealVaults = Boolean(vaults && vaults.length > 0);
  const displayVaults = hasRealVaults ? vaults! : demoGoals;
  const totalBalance =
    displayVaults?.reduce((sum: number, v: any) => sum + Number(v.balanceMinor || 0), 0) ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>My Savings</ThemedText>

      <GlassCard style={styles.hero}>
        <ThemedText style={styles.kicker}>TOTAL BALANCE</ThemedText>
        <ThemedText style={styles.bigBalance}>₦ {totalBalance.toLocaleString()}</ThemedText>
        <View style={styles.trendPill}>
          <Ionicons name="trending-up-outline" size={16} color="#0f766e" />
          <ThemedText style={styles.trendText}>+12% this month</ThemedText>
        </View>
      </GlassCard>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ThemedText style={styles.error}>Failed to load vaults</ThemedText>}

      {displayVaults &&
        displayVaults.map((v: any, idx: number) => {
          const pct = v.targetAmountMinor
            ? Math.min(100, Math.round((v.balanceMinor / v.targetAmountMinor) * 100))
            : 0;
          return (
            <GlassCard key={v.id} style={styles.vaultCard}>
              <View style={styles.vaultHeader}>
                <View style={styles.vaultIcon}>
                  <Ionicons name={icons[idx % icons.length] as any} size={20} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.vaultTitle}>{v.name}</ThemedText>
                  <ThemedText style={styles.vaultSub}>{v.description || 'Goal savings'}</ThemedText>
                </View>
                <ThemedText style={styles.vaultPct}>{pct}%</ThemedText>
              </View>
              <View style={styles.amountRow}>
                <ThemedText style={styles.amountMain}>
                  ₦{Number(v.balanceMinor).toLocaleString()}
                </ThemedText>
                <ThemedText style={styles.amountSub}>
                  / ₦{Number(v.targetAmountMinor).toLocaleString()}
                </ThemedText>
              </View>
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${pct}%`, backgroundColor: progressColors[idx % progressColors.length] }
                  ]}
                />
              </View>
              <View style={styles.btnRow}>
                <GradientButton
                  title="+ Deposit"
                  onPress={() => {
                    if (!hasRealVaults) return;
                    setSelectedVault(v.id);
                  }}
                  style={{ flex: 1 }}
                />
                <GradientButton
                  title="Withdraw"
                  onPress={() => {
                    if (!hasRealVaults) return;
                    withdraw.mutate({
                      vaultId: v.id,
                      currency: 'NGN',
                      amountMinor: Number(amount),
                      reference: `wd-${Date.now()}`
                    });
                  }}
                  style={{ flex: 1, marginLeft: 10 }}
                />
              </View>
              {!hasRealVaults && (
                <ThemedText style={styles.demoNote}>Demo goal — create one to start saving.</ThemedText>
              )}
            </GlassCard>
          );
        })}

      <GlassCard style={{ marginTop: 16, marginBottom: 24 }}>
        <ThemedText style={styles.sectionTitle}>Quick Deposit</ThemedText>
        <ThemedText style={styles.label}>Vault ID</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Select a vault above or enter ID"
          placeholderTextColor={colors.textSecondary}
          value={selectedVault || ''}
          onChangeText={setSelectedVault}
        />
        <ThemedText style={styles.label}>Amount (minor)</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="100000"
          placeholderTextColor={colors.textSecondary}
          keyboardType="number-pad"
          value={amount}
          onChangeText={setAmount}
        />
        {deposit.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton
            title="Deposit"
            onPress={() =>
              deposit.mutate({
                vaultId: selectedVault || '',
                currency: 'NGN',
                amountMinor: Number(amount),
                reference: `dep-${Date.now()}`
              })
            }
            style={{ marginTop: 10 }}
          />
        )}
        {(deposit.error || withdraw.error) && (
          <ThemedText style={styles.error}>
            {(deposit.error as Error | undefined)?.message || (withdraw.error as Error | undefined)?.message}
          </ThemedText>
        )}
        {!hasRealVaults && (
          <ThemedText style={[styles.muted, { marginTop: 6 }]}>
            Add a savings goal to enable real deposits.
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
  trendPill: {
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(79,224,193,0.15)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8
  },
  trendText: { color: colors.textPrimary, fontWeight: '700' },
  vaultCard: {
    marginTop: 16
  },
  vaultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6
  },
  vaultIcon: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  vaultTitle: { fontWeight: '800', fontSize: 16 },
  vaultSub: { color: colors.textSecondary, fontSize: 12 },
  vaultPct: { fontWeight: '800', color: colors.accent },
  amountRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 6, marginTop: 6 },
  amountMain: { fontSize: 22, fontWeight: '800' },
  amountSub: { color: colors.textSecondary, fontSize: 14, marginBottom: 2 },
  progressTrack: {
    height: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 4,
    marginTop: 10,
    overflow: 'hidden'
  },
  progressFill: {
    height: 8,
    borderRadius: 4
  },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
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
  error: { color: 'tomato', marginTop: 8 },
  muted: { color: colors.textSecondary },
  demoNote: { color: colors.textSecondary, fontSize: 12, marginTop: 6 }
});
