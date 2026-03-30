import React from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../components/Themed';
import { useCards } from '../hooks/useCards';
import { useAuth } from '../providers/AuthProvider';
import { useCardBlock, useCardCreate, useCardUnblock } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { useWallets } from '../hooks/useWallets';

export const CardsScreen: React.FC = () => {
  const { session } = useAuth();
  const { data: cards, isLoading, isError } = useCards(session?.accessToken);
  const { data: wallets } = useWallets(session?.accessToken);
  const create = useCardCreate(session?.accessToken);
  const block = useCardBlock(session?.accessToken);
  const unblock = useCardUnblock(session?.accessToken);

  const ngnWallet = wallets?.find((wallet: any) => wallet.currency === 'NGN');
  const canCreateCard = Boolean(ngnWallet?.id);
  const list = cards ?? [];

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

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Create Virtual Card</ThemedText>
        <ThemedText style={styles.cardSub}>
          Funding wallet: {ngnWallet?.id ?? 'No NGN wallet found'}
        </ThemedText>
        {!canCreateCard && (
          <ThemedText style={styles.error}>Create or fund an NGN wallet before creating a card.</ThemedText>
        )}
        {create.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton
            title="Create Card"
            onPress={() => {
              if (!canCreateCard) return;
              create.mutate({
                fundingAccountId: ngnWallet!.id,
                currency: 'NGN'
              });
            }}
            style={{ marginTop: 10 }}
          />
        )}
        {create.error && <ThemedText style={styles.error}>{(create.error as Error).message}</ThemedText>}
      </GlassCard>

      {isLoading && <ActivityIndicator color={colors.accent} />}
      {isError && <ThemedText style={styles.error}>Failed to load cards</ThemedText>}

      {!isLoading && list.length === 0 && (
        <GlassCard style={{ marginTop: 16 }}>
          <ThemedText style={styles.cardSub}>No cards yet. Create your first card above.</ThemedText>
        </GlassCard>
      )}

      {list.map((card: any) => {
        const normalizedStatus = String(card.status ?? '').toUpperCase();
        const isBlocked = normalizedStatus === 'BLOCKED';
        const statusLabel =
          normalizedStatus.length > 0
            ? `${normalizedStatus.charAt(0)}${normalizedStatus.slice(1).toLowerCase()}`
            : 'Unknown';

        return (
          <GlassCard key={card.id} style={styles.cardItem}>
            <View style={styles.cardRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.cardBadge}>
                  <ThemedText style={styles.badgeText}>{card.currency}</ThemedText>
                </View>
                <View>
                  <ThemedText style={styles.cardTitle}>{card.currency} ****{card.last4}</ThemedText>
                  <ThemedText style={styles.cardSub}>Card ID: {card.id}</ThemedText>
                </View>
              </View>
              <ThemedText style={[styles.status, isBlocked ? styles.statusBlocked : styles.statusActive]}>
                {statusLabel}
              </ThemedText>
            </View>
            <View style={styles.actions}>
              {isBlocked ? (
                <GradientButton title="Unblock" onPress={() => unblock.mutate(card.id)} style={{ flex: 1 }} />
              ) : (
                <GradientButton title="Block" onPress={() => block.mutate(card.id)} style={{ flex: 1 }} />
              )}
            </View>
          </GlassCard>
        );
      })}

      {(block.error || unblock.error) && (
        <ThemedText style={styles.error}>
          {(block.error as Error | undefined)?.message || (unblock.error as Error | undefined)?.message}
        </ThemedText>
      )}
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
  cardItem: { marginTop: 12 },
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
  actions: { flexDirection: 'row', gap: 8, marginTop: 10 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  error: { color: 'tomato', marginTop: 8 }
});
