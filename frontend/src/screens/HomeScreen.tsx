import React from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View, Image, FlatList } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, gradients, radius } from '../theme';

type NavTargets = 'Wallet' | 'Bills' | 'Ajo' | 'Savings' | 'FX' | 'Remit' | 'Cards' | 'Settings';

const actions: { label: string; target: NavTargets; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Send', target: 'Wallet', icon: 'arrow-up-circle' },
  { label: 'Request', target: 'Wallet', icon: 'download-outline' },
  { label: 'Scan', target: 'Wallet', icon: 'qr-code-outline' },
  { label: 'Bills', target: 'Bills', icon: 'receipt-outline' },
  { label: 'Savings', target: 'Savings', icon: 'trending-up' },
  { label: 'FX', target: 'FX', icon: 'swap-horizontal' }
];

const reefs = [
  { id: '1', title: 'Vacation', saved: '$1,200 saved', progress: 0.6, color: ['#005d57', '#0a1e2f'] },
  { id: '2', title: 'Emergency', saved: '$5,000 saved', progress: 0.25, color: ['#bf6a4f', '#0a1e2f'] },
  { id: '3', title: 'New Car', saved: '$4,500 saved', progress: 0.1, color: ['#3b4f73', '#0a1e2f'] }
];

const recent = [
  { id: 'r1', name: 'Netflix', desc: 'Subscription', amount: '-$15.99', positive: false, icon: 'film-outline', color: '#b23b3b' },
  { id: 'r2', name: 'Salary Income', desc: 'Monthly Pay', amount: '+$3,200.00', positive: true, icon: 'cash-outline', color: '#0d7d4e' },
  { id: 'r3', name: 'Starbucks', desc: 'Food & Drink', amount: '-$5.40', positive: false, icon: 'cafe-outline', color: '#c26f2b' }
];

export const HomeScreen: React.FC = () => {
  const navigation = useNavigation();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Header */}
      <View style={styles.headerRow}>
        <View style={styles.avatarWrap}>
          <Image
            source={{ uri: 'https://i.pravatar.cc/100?img=12' }}
            style={styles.avatar}
          />
          <View style={styles.statusDot} />
        </View>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <ThemedText style={styles.greetingLabel}>Good evening,</ThemedText>
          <ThemedText style={styles.greetingName}>Alex</ThemedText>
        </View>
        <View style={styles.bell}>
          <Ionicons name="notifications-outline" size={20} color={colors.textPrimary} />
          <View style={styles.badge} />
        </View>
      </View>

      {/* Liquidity Card */}
      <GlassCard style={styles.liquidityCard}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="shield-checkmark" size={18} color={colors.accent} />
          <ThemedText style={styles.kicker}>  TOTAL LIQUIDITY</ThemedText>
        </View>
        <ThemedText style={styles.bigBalance}>$24,593.00</ThemedText>
        <View style={{ marginTop: 16, alignItems: 'flex-start' }}>
          <GradientButton title="+ Add Money" onPress={() => navigation.navigate('Wallet' as never)} style={{ width: 160 }} />
        </View>
        <View style={styles.toggleGhost}>
          <View style={styles.toggleCircle} />
          <View style={[styles.toggleCircle, { left: 32, opacity: 0.5 }]} />
        </View>
      </GlassCard>

      {/* Quick Actions */}
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

      {/* Reefs */}
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>My Reefs</ThemedText>
        <ThemedText style={styles.sectionLink}>View All</ThemedText>
      </View>
      <FlatList
        data={reefs}
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

      {/* Recent Flow */}
      <View style={styles.sectionHeader}>
        <ThemedText style={styles.sectionTitle}>Recent Flow</ThemedText>
      </View>
      <View style={{ gap: 10, marginBottom: 24 }}>
        {recent.map((r) => (
          <GlassCard key={r.id} style={styles.recentCard}>
            <View style={styles.recentLeft}>
              <View style={[styles.recentIcon, { backgroundColor: r.color }]}>
                <Ionicons name={r.icon as any} size={18} color="#fff" />
              </View>
              <View>
                <ThemedText style={styles.recentTitle}>{r.name}</ThemedText>
                <ThemedText style={styles.recentMeta}>{r.desc}</ThemedText>
              </View>
            </View>
            <ThemedText style={[styles.recentAmount, r.positive ? styles.amountPositive : undefined]}>
              {r.amount}
            </ThemedText>
          </GlassCard>
        ))}
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
  toggleGhost: {
    flexDirection: 'row',
    marginTop: 16,
    opacity: 0.3
  },
  toggleCircle: {
    width: 32,
    height: 18,
    borderRadius: 9,
    backgroundColor: 'rgba(255,255,255,0.08)',
    position: 'absolute'
  },
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
  recentMeta: { color: colors.textSecondary, fontSize: 12 },
  recentAmount: { fontWeight: '800', fontSize: 15 },
  amountPositive: { color: colors.accent }
});
