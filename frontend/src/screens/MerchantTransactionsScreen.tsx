import React, { useMemo, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors } from '../theme';
import { useAuth } from '../providers/AuthProvider';
import { useMerchantProfile, useMerchantTransactions } from '../hooks/useMerchant';

type ChannelFilter = 'ALL' | 'CARD' | 'TRANSFER' | 'QR';

const filters: ChannelFilter[] = ['ALL', 'CARD', 'TRANSFER', 'QR'];

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
  return parsed.toLocaleString();
}

function normalizeChannel(channel: string) {
  const normalized = String(channel ?? '').toUpperCase();
  if (normalized.includes('QR')) return 'QR';
  if (normalized.includes('CARD')) return 'CARD';
  if (normalized.includes('TRANSFER') || normalized.includes('NIP')) return 'TRANSFER';
  return normalized || 'UNKNOWN';
}

export const MerchantTransactionsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const profileQuery = useMerchantProfile(session?.accessToken);
  const hasMerchant = !!profileQuery.data?.id;
  const txQuery = useMerchantTransactions(session?.accessToken, 120, hasMerchant);
  const [filter, setFilter] = useState<ChannelFilter>('ALL');

  const rows = txQuery.data ?? [];

  const filteredRows = useMemo(() => {
    if (filter === 'ALL') return rows;
    return rows.filter((item) => normalizeChannel(item.channel) === filter);
  }, [filter, rows]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={profileQuery.isRefetching || txQuery.isRefetching}
          onRefresh={() => {
            void profileQuery.refetch();
            void txQuery.refetch();
          }}
          tintColor="#fff"
        />
      }
    >
      <ThemedText style={styles.heading}>Merchant Transactions</ThemedText>

      {!profileQuery.isLoading && !hasMerchant ? (
        <GlassCard>
          <ThemedText style={styles.emptyTitle}>Merchant profile required</ThemedText>
          <ThemedText style={styles.emptySub}>
            Complete merchant onboarding to start receiving merchant transactions.
          </ThemedText>
          <GradientButton
            title="Go to Merchant Onboarding"
            onPress={() => navigation.navigate('MerchantOnboarding')}
            style={{ marginTop: 12 }}
          />
        </GlassCard>
      ) : null}

      {profileQuery.isLoading || txQuery.isLoading ? (
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

      {hasMerchant && !txQuery.isLoading && filteredRows.length === 0 ? (
        <GlassCard>
          <ThemedText style={styles.emptySub}>No transactions in this view.</ThemedText>
        </GlassCard>
      ) : null}

      {filteredRows.map((item) => (
        <GlassCard key={item.id || item.reference} style={styles.rowCard}>
          <View style={styles.rowTop}>
            <ThemedText style={styles.reference}>{item.reference}</ThemedText>
            <ThemedText style={styles.status}>{item.status}</ThemedText>
          </View>
          <View style={styles.rowMid}>
            <ThemedText style={styles.amount}>{formatMinor(item.amountMinor, item.currency)}</ThemedText>
            <ThemedText style={styles.channel}>{normalizeChannel(item.channel)}</ThemedText>
          </View>
          <ThemedText style={styles.meta}>
            Fee: {formatMinor(item.feeMinor, item.currency)} | Net: {formatMinor(item.netAmountMinor, item.currency)}
          </ThemedText>
          <ThemedText style={styles.meta}>Posted: {formatDate(item.postedAt)}</ThemedText>
        </GlassCard>
      ))}

      {(profileQuery.isError || txQuery.isError) && (
        <GlassCard>
          <ThemedText style={styles.error}>Unable to load merchant transaction resources right now.</ThemedText>
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
    alignItems: 'center',
    gap: 10
  },
  reference: {
    fontWeight: '700',
    fontSize: 14,
    flex: 1
  },
  status: {
    color: colors.textSecondary,
    fontSize: 12
  },
  rowMid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  amount: {
    fontWeight: '800',
    fontSize: 18
  },
  channel: {
    color: colors.accent,
    fontWeight: '700'
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

