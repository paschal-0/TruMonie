import React from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { useAuth } from '../providers/AuthProvider';
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications
} from '../hooks/useNotifications';
import { colors, radius } from '../theme';

function formatDate(value?: string) {
  if (!value) return 'Just now';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Just now';
  return parsed.toLocaleString();
}

export const NotificationsScreen: React.FC = () => {
  const { session } = useAuth();
  const { data, isLoading, isError, refetch } = useNotifications(session?.accessToken, 100);
  const markRead = useMarkNotificationRead(session?.accessToken);
  const markAllRead = useMarkAllNotificationsRead(session?.accessToken);

  const notifications = data ?? [];

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#fff" />}
    >
      <View style={styles.header}>
        <ThemedText style={styles.heading}>Notifications</ThemedText>
        <TouchableOpacity style={styles.readAllBtn} onPress={() => markAllRead.mutate()} disabled={markAllRead.isPending}>
          <ThemedText style={styles.readAllText}>{markAllRead.isPending ? '...' : 'Mark all read'}</ThemedText>
        </TouchableOpacity>
      </View>

      {isLoading && (
        <GlassCard>
          <ActivityIndicator color={colors.accent} />
        </GlassCard>
      )}

      {isError && (
        <GlassCard>
          <ThemedText style={styles.error}>Failed to load notifications.</ThemedText>
        </GlassCard>
      )}

      {!isLoading && notifications.length === 0 && (
        <GlassCard>
          <ThemedText style={styles.empty}>No notifications yet.</ThemedText>
        </GlassCard>
      )}

      {notifications.map((item: any) => {
        const isRead = !!item.readAt;
        return (
          <TouchableOpacity
            key={item.id}
            activeOpacity={0.85}
            onPress={() => {
              if (!isRead) {
                markRead.mutate(item.id);
              }
            }}
          >
            <GlassCard style={styles.card}>
              <View style={styles.row}>
                <View style={[styles.iconWrap, !isRead ? styles.iconUnread : undefined]}>
                  <Ionicons name="notifications-outline" size={16} color="#fff" />
                </View>
                <View style={{ flex: 1 }}>
                  <ThemedText style={styles.type}>{item.type}</ThemedText>
                  <ThemedText style={styles.message}>{item.message}</ThemedText>
                  <ThemedText style={styles.meta}>{formatDate(item.createdAt)}</ThemedText>
                </View>
                {!isRead ? <View style={styles.unreadDot} /> : null}
              </View>
            </GlassCard>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, backgroundColor: colors.bg },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  readAllBtn: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  readAllText: { color: colors.textSecondary, fontWeight: '600' },
  card: { paddingVertical: 14 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#4b5563'
  },
  iconUnread: { backgroundColor: colors.primary },
  type: { fontWeight: '700', fontSize: 13, marginBottom: 2 },
  message: { color: colors.textPrimary, fontSize: 14 },
  meta: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#f43f5e',
    marginTop: 6
  },
  empty: { color: colors.textSecondary },
  error: { color: 'tomato' }
});
