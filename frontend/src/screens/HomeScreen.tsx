import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, Image, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { useAuth } from '../providers/AuthProvider';
import { useWallets } from '../hooks/useWallets';
import { useWalletStatement } from '../hooks/useWalletStatement';
import { useSavingsVaults } from '../hooks/useSavingsVaults';
import { useProfile } from '../hooks/useProfile';
import { useNotificationUnreadCount } from '../hooks/useNotifications';

type NavTargets =
  | 'Wallet'
  | 'Bills'
  | 'Ajo'
  | 'Savings'
  | 'FX'
  | 'Remit'
  | 'Cards'
  | 'Settings'
  | 'Notifications';
type GradientPair = readonly [string, string];

const actions: { label: string; target: NavTargets; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Send', target: 'Wallet', icon: 'arrow-up-circle' },
  { label: 'Request', target: 'Wallet', icon: 'download-outline' },
  { label: 'Scan', target: 'Wallet', icon: 'qr-code-outline' },
  { label: 'Bills', target: 'Bills', icon: 'receipt-outline' },
  { label: 'Savings', target: 'Savings', icon: 'trending-up' },
  { label: 'FX', target: 'FX', icon: 'swap-horizontal' }
];

const reefPalette: GradientPair[] = [
  ['#005d57', '#0a1e2f'],
  ['#bf6a4f', '#0a1e2f'],
  ['#3b4f73', '#0a1e2f']
];

const currencySymbol: Record<string, string> = {
  NGN: '\u20A6',
  USD: '$'
};

function formatMinor(amountMinor: string | number | null | undefined, currency = 'NGN') {
  const symbol = currencySymbol[currency] ?? '';
  const amount = Number(amountMinor ?? 0);
  if (!Number.isFinite(amount)) return `${symbol}0.00`;
  return `${symbol}${(amount / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

function formatDate(value?: string) {
  if (!value) return 'Just now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Just now';
  return parsed.toLocaleString();
}

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation();
  const { session } = useAuth();
  const { data: profile } = useProfile(session?.accessToken);
  const { data: wallets } = useWallets(session?.accessToken);
  const { data: vaults } = useSavingsVaults(session?.accessToken);
  const { data: unread } = useNotificationUnreadCount(session?.accessToken);

  const ngnWallet = wallets?.find((wallet: any) => wallet.currency === 'NGN');
  const accountId = ngnWallet?.id ?? wallets?.[0]?.id;
  const { data: statement } = useWalletStatement(session?.accessToken, accountId, 5);

  const displayName = profile?.firstName ?? profile?.username ?? 'there';

  const totalLiquidityMinor = useMemo(
    () =>
      (wallets ?? [])
        .filter((wallet: any) => wallet.currency === 'NGN')
        .reduce((sum: number, wallet: any) => sum + Number(wallet.balanceMinor || 0), 0),
    [wallets]
  );

  const reefItems = useMemo(
    () =>
      (vaults ?? []).slice(0, 3).map((vault: any, index: number) => {
        const target = Number(vault.targetAmountMinor || 0);
        const balance = Number(vault.balanceMinor || 0);
        const progress = target > 0 ? Math.max(0, Math.min(1, balance / target)) : 0;
        return {
          id: vault.id,
          title: vault.name ?? `Vault ${index + 1}`,
          saved: `${formatMinor(balance, vault.currency)} saved`,
          progress,
          color: reefPalette[index % reefPalette.length]
        };
      }),
    [vaults]
  );

  const recentLines = statement?.lines ?? [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.avatarWrap}>
          <Image source={{ uri: 'https://i.pravatar.cc/100?img=12' }} style={styles.avatar} />
          <View style={styles.statusDot} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <ThemedText style={styles.greetingLabel}>Good evening,</ThemedText>
          <ThemedText style={styles.greetingName}>{displayName}</ThemedText>
        </View>
        <TouchableOpacity style={styles.bell} onPress={() => navigation.navigate('Notifications' as never)}>
          <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          {(unread?.count ?? 0) > 0 ? <View style={styles.badge} /> : null}
        </TouchableOpacity>
      </View>

      <GlassCard style={styles.liquidityCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
          <ThemedText style={styles.kicker}>  PRIMARY LIQUIDITY (NGN)</ThemedText>
        </View>
        <ThemedText style={styles.bigBalance}>{formatMinor(totalLiquidityMinor, 'NGN')}</ThemedText>
        <ThemedText style={styles.balanceMeta}>
          Account: {ngnWallet?.accountNumber ?? 'Not provisioned yet'}
        </ThemedText>
        <View style={{ marginTop: 16, alignItems: 'flex-start' }}>
          <GradientButton
            title="+ Add Money"
            onPress={() => navigation.navigate('Wallet' as never)}
            style={{ width: 160 }}
          />
        </View>
      </GlassCard>

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Quick Actions</ThemedText>
      </View>
      <View style={styles.actionsGrid}>
        {actions.slice(0, 3).map((a) => (
          <TouchableOpacity key={a.label} style={styles.quickBtn} onPress={() => navigation.navigate(a.target as never)}>
            <Ionicons name={a.icon} size={24} color={colors.textPrimary} />
            <ThemedText style={styles.quickLabel}>{a.label}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>
      <View style={[styles.actionsGrid, { marginTop: 10 }]}>
        {actions.slice(3).map((a) => (
          <TouchableOpacity key={a.label} style={styles.quickBtn} onPress={() => navigation.navigate(a.target as never)}>
            <Ionicons name={a.icon} size={24} color={colors.textPrimary} />
            <ThemedText style={styles.quickLabel}>{a.label}</ThemedText>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>My Reefs</ThemedText>
        <ThemedText style={styles.sectionLink}>Savings Vaults</ThemedText>
      </View>
      {reefItems.length === 0 ? (
        <GlassCard style={{ marginTop: 8 }}>
          <ThemedText style={styles.emptyText}>No savings vault yet. Open Savings to create one.</ThemedText>
        </GlassCard>
      ) : (
        <FlatList
          data={reefItems}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: 12, paddingVertical: 6 }}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => (
            <LinearGradient colors={item.color} style={styles.reefCard}>
              <View style={styles.progressBarOuter}>
                <View style={[styles.progressBarInner, { width: `${item.progress * 100}%` }]} />
              </View>
              <ThemedText style={styles.reefTitle}>{item.title}</ThemedText>
              <ThemedText style={styles.reefSub}>{item.saved}</ThemedText>
              <View style={styles.percentPill}>
                <ThemedText style={styles.percentText}>{Math.round(item.progress * 100)}%</ThemedText>
              </View>
            </LinearGradient>
          )}
        />
      )}

      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Recent Flow</ThemedText>
      </View>
      <View style={{ gap: 10, marginBottom: 24 }}>
        {recentLines.length === 0 ? (
          <GlassCard>
            <ThemedText style={styles.emptyText}>No recent wallet entries yet.</ThemedText>
          </GlassCard>
        ) : (
          recentLines.map((line: any) => {
            const positive = String(line.direction).toUpperCase() === 'CREDIT';
            const icon = positive ? 'arrow-down-outline' : 'arrow-up-outline';
            const bg = positive ? '#0d7d4e' : '#b23b3b';
            return (
              <GlassCard key={line.id} style={styles.recentCard}>
                <View style={styles.recentLeft}>
                  <View style={[styles.recentIcon, { backgroundColor: bg }]}>
                    <Ionicons name={icon} size={18} color="#fff" />
                  </View>
                  <View>
                    <ThemedText style={styles.recentTitle}>
                      {positive ? 'Credit entry' : 'Debit entry'}
                    </ThemedText>
                    <ThemedText style={styles.recentMeta}>
                      {line.memo || formatDate(line.createdAt)}
                    </ThemedText>
                  </View>
                </View>
                <ThemedText style={[styles.recentAmount, positive ? styles.amountPositive : undefined]}>
                  {positive ? '+' : '-'}
                  {formatMinor(line.amountMinor, line.currency)}
                </ThemedText>
              </GlassCard>
            );
          })
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 12,
    backgroundColor: colors.bg
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  avatarWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    overflow: 'hidden',
    position: 'relative'
  },
  avatar: {
    width: '100%',
    height: '100%'
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.bg
  },
  bell: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f43f5e'
  },
  greetingLabel: { color: colors.textSecondary, fontSize: 13 },
  greetingName: { color: colors.textPrimary, fontSize: 18, fontWeight: '800' },
  liquidityCard: {
    marginTop: 4,
    backgroundColor: 'rgba(0,0,0,0.12)',
    borderRadius: 24,
    padding: 18
  },
  kicker: { color: colors.textSecondary, fontSize: 13 },
  bigBalance: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  balanceMeta: { color: colors.textSecondary, marginTop: 6, fontSize: 12 },
  actionsGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12
  },
  quickBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6
  },
  quickLabel: { fontSize: 12, color: colors.textSecondary },
  sectionHeader: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.textPrimary },
  sectionLink: { color: colors.accent, fontWeight: '700' },
  reefCard: {
    width: 170,
    borderRadius: radius.lg,
    padding: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  progressBarOuter: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: 12
  },
  progressBarInner: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.accent
  },
  percentPill: {
    position: 'absolute',
    top: 12,
    right: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12
  },
  percentText: { fontWeight: '700', color: colors.textPrimary, fontSize: 12 },
  reefTitle: { fontWeight: '800', fontSize: 16, marginTop: 6 },
  reefSub: { color: colors.textSecondary, marginTop: 4 },
  recentCard: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14
  },
  recentLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  recentIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  recentTitle: { fontWeight: '700', fontSize: 15 },
  recentMeta: { color: colors.textSecondary, fontSize: 12, maxWidth: 180 },
  recentAmount: { fontWeight: '800', fontSize: 15 },
  amountPositive: { color: colors.accent },
  emptyText: { color: colors.textSecondary }
});
