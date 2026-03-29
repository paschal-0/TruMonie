import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../components/Themed';
import { useCards } from '../hooks/useCards';
import { useAuth } from '../providers/AuthProvider';
import { useCardBlock, useCardCreate, useCardUnblock } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';

const demoCards = [
  { id: 'demo1', currency: 'NGN', last4: '4421', status: 'active', limit: '₦500,000', spend: '₦120,000' },
  { id: 'demo2', currency: 'USD', last4: '9931', status: 'blocked', limit: '$2,000', spend: '$250' }
];

export const CardsScreen: React.FC = () => {
  const { session } = useAuth();
  const { data: cards, isLoading, isError } = useCards(session?.accessToken);
  const create = useCardCreate(session?.accessToken);
  const block = useCardBlock(session?.accessToken);
  const unblock = useCardUnblock(session?.accessToken);
  const [fundingAccountId, setFundingAccountId] = useState('');
  const [cardId, setCardId] = useState('');

  const hasRealCards = Boolean(cards && cards.length > 0);
  const displayCards = hasRealCards ? cards! : demoCards;

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>Cards</ThemedText>

      <GlassCard style={styles.hero}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View>
            <ThemedText style={styles.kicker}>Virtual cards</ThemedText>
            <ThemedText style={styles.big}>Spend securely, instantly</ThemedText>
          </View>
          <View style={styles.heroIcon}>
            <Ionicons name="card-outline" size={26} color="#fff" />
          </View>
        </View>
      </GlassCard>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ThemedText style={styles.error}>Failed to load cards</ThemedText>}

      {displayCards.map((c: any) => (
        <GlassCard key={c.id} style={styles.cardItem}>
          <View style={styles.cardRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={styles.cardBadge}>
                <ThemedText style={styles.badgeText}>{c.currency}</ThemedText>
              </View>
              <View>
                <ThemedText style={styles.cardTitle}>{c.currency} ••••{c.last4}</ThemedText>
                <ThemedText style={styles.cardSub}>Limit: {c.limit ?? '—'}</ThemedText>
              </View>
            </View>
            <ThemedText style={[styles.status, c.status === 'blocked' ? styles.statusBlocked : styles.statusActive]}>
              {c.status}
            </ThemedText>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: '35%' }]} />
          </View>
          <ThemedText style={styles.cardSub}>Spend this month: {c.spend ?? '—'}</ThemedText>
        </GlassCard>
      ))}

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Create Virtual Card</ThemedText>
        <ThemedText style={styles.label}>Funding Account ID</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="account-id"
          placeholderTextColor={colors.textSecondary}
          value={fundingAccountId}
          onChangeText={setFundingAccountId}
          autoCapitalize="none"
        />
        <GradientButton
          title="Create Card"
          onPress={() =>
            create.mutate({
              fundingAccountId,
              currency: 'NGN'
            })
          }
          style={{ marginTop: 10 }}
        />
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 24 }}>
        <ThemedText style={styles.sectionTitle}>Block / Unblock</ThemedText>
        <ThemedText style={styles.label}>Card ID</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Card ID"
          placeholderTextColor={colors.textSecondary}
          value={cardId}
          onChangeText={setCardId}
          autoCapitalize="none"
        />
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
          <GradientButton title="Block" onPress={() => block.mutate(cardId)} style={{ flex: 1 }} />
          <GradientButton title="Unblock" onPress={() => unblock.mutate(cardId)} style={{ flex: 1 }} />
        </View>
        {(create.error || block.error || unblock.error) && (
          <ThemedText style={styles.error}>
            {(create.error as Error | undefined)?.message ||
              (block.error as Error | undefined)?.message ||
              (unblock.error as Error | undefined)?.message}
          </ThemedText>
        )}
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
  cardItem: {
    marginTop: 12
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  cardBadge: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: { fontWeight: '800' },
  cardTitle: { fontWeight: '800', fontSize: 16 },
  cardSub: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  status: { fontWeight: '800', textTransform: 'capitalize' },
  statusBlocked: { color: 'tomato' },
  statusActive: { color: colors.accent },
  progressTrack: {
    height: 6,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 4
  },
  progressFill: { height: 6, borderRadius: 3, backgroundColor: colors.accent },
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
  error: { color: 'tomato', marginTop: 8 }
});
