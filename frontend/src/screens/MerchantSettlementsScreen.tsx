import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { useAuth } from '../providers/AuthProvider';
import { useMerchantProfile, useMerchantSettlements } from '../hooks/useMerchant';

type SettlementFilter = 'ALL' | 'PENDING' | 'SETTLED' | 'FAILED';

const filters: SettlementFilter[] = ['ALL', 'PENDING', 'SETTLED', 'FAILED'];

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

export const MerchantSettlementsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const profileQuery = useMerchantProfile(session?.accessToken);
  const hasMerchant = !!profileQuery.data?.id;
  const settlementsQuery = useMerchantSettlements(session?.accessToken, 100, hasMerchant);
  const [filter, setFilter] = useState<SettlementFilter>('ALL');

  const rows = settlementsQuery.data ?? [];
  const filteredRows = useMemo(() => {
    if (filter === 'ALL') return rows;
    return rows.filter((item) => String(item.status).toUpperCase() === filter);
  }, [filter, rows]);

  const refresh = () => {
    void profileQuery.refetch();
    void settlementsQuery.refetch();
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={profileQuery.isRefetching || settlementsQuery.isRefetching}
          onRefresh={refresh}
          tintColor="#fff"
        />
      }
    >
      <ThemedText style={styles.heading}>Settlements</ThemedText>

      {!profileQuery.isLoading && !hasMerchant ? (
        <GlassCard>
          <ThemedText style={styles.emptyTitle}>Merchant profile required</ThemedText>
          <ThemedText style={styles.emptySub}>
            Complete merchant onboarding to access settlement reports.
          </ThemedText>
          <GradientButton
            title="Go to Merchant Onboarding"
            onPress={() => navigation.navigate('MerchantOnboarding')}
            style={{ marginTop: 12 }}
          />
        </GlassCard>
      ) : null}

      {profileQuery.isLoading || settlementsQuery.isLoading ? (
        <GlassCard>
          <ActivityIndicator color={colors.accent} />
        </GlassCard>
      ) : null}

      {hasMerchant ? (
        <View style={styles.filterRow}>
          {filters.map((item) => {
            const selected = filter === item;
            return (
              <TouchableOpacity
                key={item}
                style={[styles.filterChip, selected ? styles.filterChipActive : undefined]}
                onPress={() => setFilter(item)}
                activeOpacity={0.85}
              >
                <ThemedText style={[styles.filterText, selected ? styles.filterTextActive : undefined]}>
                  {item}
                </ThemedText>
              </TouchableOpacity>
            );
          })}
        </View>
      ) : null}

      {hasMerchant && !settlementsQuery.isLoading && filteredRows.length === 0 ? (
        <GlassCard>
          <ThemedText style={styles.emptySub}>No settlements in this view.</ThemedText>
        </GlassCard>
      ) : null}

      {filteredRows.map((item) => (
        <GlassCard key={item.id || item.reference} style={styles.rowCard}>
          <View style={styles.rowTop}>
            <ThemedText style={styles.reference}>{item.reference}</ThemedText>
            <ThemedText style={styles.status}>{item.status}</ThemedText>
          </View>
          <View style={styles.rowMid}>
            <ThemedText style={styles.amount}>{formatMinor(item.netAmountMinor)}</ThemedText>
            <ThemedText style={styles.meta}>Cycle: {item.cycle}</ThemedText>
          </View>
          <ThemedText style={styles.meta}>
            Total: {formatMinor(item.totalAmountMinor)} | Fee: {formatMinor(item.totalFeeMinor)}
          </ThemedText>
          <ThemedText style={styles.meta}>
            Transactions: {item.transactionCount} | Date: {formatDate(item.settlementDate)}
          </ThemedText>
        </GlassCard>
      ))}

      {(profileQuery.isError || settlementsQuery.isError) && (
        <GlassCard>
          <ThemedText style={styles.error}>Unable to load settlement resources right now.</ThemedText>
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
  heading: {
    fontSize: 24,
    fontWeight: '800'
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8
  },
  filterChip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  filterChipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(79,224,193,0.12)'
  },
  filterText: {
    color: colors.textSecondary,
    fontWeight: '700',
    fontSize: 12
  },
  filterTextActive: {
    color: colors.accent
  },
  rowCard: {
    gap: 4
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  reference: {
    fontWeight: '800',
    fontSize: 14,
    flex: 1
  },
  status: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 8,
    paddingVertical: 4,
    fontSize: 12,
    color: colors.textSecondary
  },
  rowMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 2
  },
  amount: {
    fontWeight: '800',
    fontSize: 18
  },
  meta: {
    color: colors.textSecondary
  },
  emptyTitle: {
    fontWeight: '800',
    fontSize: 17
  },
  emptySub: {
    color: colors.textSecondary,
    marginTop: 4
  },
  error: {
    color: 'tomato'
  }
});

