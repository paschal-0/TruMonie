import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  View
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { useAuth } from '../providers/AuthProvider';
import {
  useMerchantProfile,
  useMerchantSettlements,
  useMerchantTerminals,
  useMerchantTransactions
} from '../hooks/useMerchant';

function formatMinor(amountMinor: number, currency = 'NGN') {
  const symbol = currency === 'NGN' ? '\u20A6' : currency === 'USD' ? '$' : '';
  return `${symbol}${(amountMinor / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value?: string) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleDateString();
}

function statusColor(status?: string) {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'APPROVED' || normalized === 'ACTIVE') return '#10b981';
  if (normalized === 'PENDING' || normalized === 'UNDER_REVIEW') return '#f59e0b';
  if (normalized === 'REJECTED' || normalized === 'SUSPENDED') return '#ef4444';
  return colors.textSecondary;
}

const ActionCard: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle: string;
  onPress: () => void;
}> = ({ icon, title, subtitle, onPress }) => (
  <TouchableOpacity style={styles.actionCard} onPress={onPress} activeOpacity={0.85}>
    <View style={styles.actionIcon}>
      <Ionicons name={icon} size={20} color={colors.textPrimary} />
    </View>
    <View style={{ flex: 1 }}>
      <ThemedText style={styles.actionTitle}>{title}</ThemedText>
      <ThemedText style={styles.actionSub}>{subtitle}</ThemedText>
    </View>
    <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />
  </TouchableOpacity>
);

export const MerchantHubScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();

  const profileQuery = useMerchantProfile(session?.accessToken);
  const merchant = profileQuery.data;
  const hasMerchant = !!merchant?.id;

  const terminalsQuery = useMerchantTerminals(session?.accessToken, hasMerchant);
  const settlementsQuery = useMerchantSettlements(session?.accessToken, 20, hasMerchant);
  const txQuery = useMerchantTransactions(session?.accessToken, 30, hasMerchant);

  const isLoading = profileQuery.isLoading || (hasMerchant && (terminalsQuery.isLoading || settlementsQuery.isLoading));
  const isRefreshing = profileQuery.isRefetching || terminalsQuery.isRefetching || settlementsQuery.isRefetching;

  const activeTerminalCount = useMemo(
    () =>
      (terminalsQuery.data ?? []).filter((item) =>
        ['ACTIVE', 'ONLINE'].includes(String(item.status ?? '').toUpperCase())
      ).length,
    [terminalsQuery.data]
  );

  const pendingSettlementCount = useMemo(
    () =>
      (settlementsQuery.data ?? []).filter((item) =>
        ['PENDING', 'PROCESSING'].includes(String(item.status ?? '').toUpperCase())
      ).length,
    [settlementsQuery.data]
  );

  const settledVolumeMinor = useMemo(
    () =>
      (settlementsQuery.data ?? []).reduce((sum, item) => {
        const status = String(item.status ?? '').toUpperCase();
        if (status !== 'SETTLED' && status !== 'SUCCESS') return sum;
        return sum + Number(item.netAmountMinor || 0);
      }, 0),
    [settlementsQuery.data]
  );

  const successfulTxVolumeMinor = useMemo(
    () =>
      (txQuery.data ?? []).reduce((sum, item) => {
        const status = String(item.status ?? '').toUpperCase();
        return status === 'SUCCESS' ? sum + Number(item.amountMinor || 0) : sum;
      }, 0),
    [txQuery.data]
  );

  const onRefresh = () => {
    void profileQuery.refetch();
    void terminalsQuery.refetch();
    void settlementsQuery.refetch();
    void txQuery.refetch();
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={onRefresh} tintColor="#fff" />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.heading}>Merchant Center</ThemedText>
        <TouchableOpacity
          style={styles.headerAction}
          onPress={() => navigation.navigate('MerchantOnboarding')}
          activeOpacity={0.85}
        >
          <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
          <ThemedText style={styles.headerActionText}>Onboard</ThemedText>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <GlassCard>
          <ActivityIndicator color={colors.accent} />
        </GlassCard>
      ) : null}

      {!isLoading && !hasMerchant ? (
        <GlassCard>
          <ThemedText style={styles.emptyTitle}>No merchant profile yet</ThemedText>
          <ThemedText style={styles.emptySub}>
            Create your merchant profile to request POS terminals, receive payments, and view settlement reports.
          </ThemedText>
          <GradientButton
            title="Start Merchant Onboarding"
            onPress={() => navigation.navigate('MerchantOnboarding')}
            style={{ marginTop: 12 }}
          />
        </GlassCard>
      ) : null}

      {hasMerchant ? (
        <>
          <GlassCard style={styles.heroCard}>
            <View style={styles.statusRow}>
              <ThemedText style={styles.businessName}>{merchant.businessName}</ThemedText>
              <View style={[styles.statusPill, { borderColor: statusColor(merchant.status) }]}>
                <ThemedText style={[styles.statusText, { color: statusColor(merchant.status) }]}>
                  {merchant.status}
                </ThemedText>
              </View>
            </View>
            <ThemedText style={styles.metaLine}>
              Code: {merchant.merchantCode ?? 'Pending'} | Type: {merchant.businessType}
            </ThemedText>
            <ThemedText style={styles.metaLine}>
              Settlement: {merchant.settlementBank ?? '-'} / {merchant.settlementAccount ?? '-'}
            </ThemedText>
            <ThemedText style={styles.metaLine}>Created: {formatDate(merchant.createdAt)}</ThemedText>
          </GlassCard>

          <View style={styles.kpiGrid}>
            <GlassCard style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Active Terminals</ThemedText>
              <ThemedText style={styles.kpiValue}>{activeTerminalCount}</ThemedText>
            </GlassCard>
            <GlassCard style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Pending Settlements</ThemedText>
              <ThemedText style={styles.kpiValue}>{pendingSettlementCount}</ThemedText>
            </GlassCard>
            <GlassCard style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Settled Volume</ThemedText>
              <ThemedText style={styles.kpiValue}>{formatMinor(settledVolumeMinor)}</ThemedText>
            </GlassCard>
            <GlassCard style={styles.kpiCard}>
              <ThemedText style={styles.kpiLabel}>Recent Success Volume</ThemedText>
              <ThemedText style={styles.kpiValue}>{formatMinor(successfulTxVolumeMinor)}</ThemedText>
            </GlassCard>
          </View>
        </>
      ) : null}

      <View style={{ gap: 10 }}>
        <ActionCard
          icon="hardware-chip-outline"
          title="POS Terminals"
          subtitle="View terminals and request new devices"
          onPress={() => navigation.navigate('MerchantTerminals')}
        />
        <ActionCard
          icon="receipt-outline"
          title="Settlements"
          subtitle="Track T+0 / T+1 settlement outcomes"
          onPress={() => navigation.navigate('MerchantSettlements')}
        />
        <ActionCard
          icon="swap-horizontal-outline"
          title="Merchant Transactions"
          subtitle="Review card, transfer, and QR collections"
          onPress={() => navigation.navigate('MerchantTransactions')}
        />
      </View>

      {(profileQuery.isError || terminalsQuery.isError || settlementsQuery.isError || txQuery.isError) && (
        <GlassCard>
          <ThemedText style={styles.errorText}>
            One or more merchant resources failed to load. Pull down to refresh.
          </ThemedText>
        </GlassCard>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 12,
    backgroundColor: colors.bg
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary
  },
  headerAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  headerActionText: {
    color: colors.accent,
    fontWeight: '700'
  },
  heroCard: {
    backgroundColor: 'rgba(0,0,0,0.16)'
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  businessName: {
    fontSize: 20,
    fontWeight: '800',
    flex: 1
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusText: {
    fontSize: 12,
    fontWeight: '800'
  },
  metaLine: {
    color: colors.textSecondary,
    marginTop: 6
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  kpiCard: {
    width: '48%'
  },
  kpiLabel: {
    color: colors.textSecondary,
    fontSize: 12
  },
  kpiValue: {
    fontWeight: '800',
    fontSize: 17,
    marginTop: 4
  },
  actionCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  actionIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  actionTitle: {
    fontWeight: '700',
    fontSize: 14
  },
  actionSub: {
    color: colors.textSecondary,
    fontSize: 12,
    marginTop: 2
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 18
  },
  emptySub: {
    color: colors.textSecondary,
    marginTop: 6
  },
  errorText: {
    color: 'tomato'
  }
});

