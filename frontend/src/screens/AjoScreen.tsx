import React, { useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { useAjoGroups } from '../hooks/useAjoGroups';
import { useAjoCreate, useAjoJoin, useAjoRunCycle } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { Ionicons } from '@expo/vector-icons';

function toPositiveInt(value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export const AjoScreen: React.FC = () => {
  const { session } = useAuth();
  const { data: groups, isLoading, isError } = useAjoGroups(session?.accessToken);
  const create = useAjoCreate(session?.accessToken);
  const join = useAjoJoin(session?.accessToken);
  const run = useAjoRunCycle(session?.accessToken);
  const [newGroup, setNewGroup] = useState({ name: '', contributionAmountMinor: '', memberTarget: '' });
  const [joinId, setJoinId] = useState('');

  const list = groups ?? [];
  const sortedGroups = useMemo(
    () => [...list].sort((a: any, b: any) => String(a.name || '').localeCompare(String(b.name || ''))),
    [list]
  );

  const onCreateGroup = () => {
    const contributionAmountMinor = toPositiveInt(newGroup.contributionAmountMinor);
    const memberTarget = toPositiveInt(newGroup.memberTarget);
    if (!newGroup.name.trim()) {
      Alert.alert('Validation', 'Group name is required.');
      return;
    }
    if (!contributionAmountMinor) {
      Alert.alert('Validation', 'Contribution must be a positive number.');
      return;
    }
    if (!memberTarget) {
      Alert.alert('Validation', 'Member target must be a positive number.');
      return;
    }
    create.mutate({
      name: newGroup.name.trim(),
      currency: 'NGN',
      contributionAmountMinor,
      memberTarget
    });
  };

  const onJoinById = () => {
    if (!joinId.trim()) {
      Alert.alert('Validation', 'Enter a group ID to join.');
      return;
    }
    join.mutate(joinId.trim());
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>Ajo / Esusu</ThemedText>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Your Groups</ThemedText>
        {isLoading && <ActivityIndicator color={colors.accent} />}
        {isError && <ThemedText style={styles.error}>Failed to load groups</ThemedText>}
        {!isLoading && sortedGroups.length === 0 && (
          <ThemedText style={styles.muted}>No groups yet. Create one below or join with a group ID.</ThemedText>
        )}
        {sortedGroups.map((g: any) => (
          <View key={g.id} style={styles.groupRow}>
            <View style={styles.groupLeft}>
              <View style={styles.groupIcon}>
                <Ionicons name="people" size={18} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.groupName}>{g.name}</ThemedText>
                <ThemedText style={styles.groupMeta}>
                  {g.currency} {g.contributionAmountMinor} - target {g.memberTarget}
                </ThemedText>
                <ThemedText style={styles.groupId}>Group ID: {g.id}</ThemedText>
              </View>
            </View>
            {run.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton title="Run Cycle" onPress={() => run.mutate(g.id)} />
            )}
          </View>
        ))}
        {run.error && <ThemedText style={styles.error}>{(run.error as Error).message}</ThemedText>}
      </GlassCard>

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Create Group</ThemedText>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Name</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="E.g. Uptown Crew"
            placeholderTextColor={colors.textSecondary}
            value={newGroup.name}
            onChangeText={(t) => setNewGroup({ ...newGroup, name: t })}
          />
        </View>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Contribution (minor)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="20000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={newGroup.contributionAmountMinor}
              onChangeText={(t) => setNewGroup({ ...newGroup, contributionAmountMinor: t })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Member target</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="5"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={newGroup.memberTarget}
              onChangeText={(t) => setNewGroup({ ...newGroup, memberTarget: t })}
            />
          </View>
        </View>
        {create.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton title="Create Group" onPress={onCreateGroup} style={{ marginTop: 10 }} />
        )}
        {create.error && <ThemedText style={styles.error}>{(create.error as Error).message}</ThemedText>}
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 16 }}>
        <ThemedText style={styles.sectionTitle}>Join Group by ID</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Group ID"
          placeholderTextColor={colors.textSecondary}
          value={joinId}
          onChangeText={setJoinId}
        />
        {join.isPending ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton title="Join Group" onPress={onJoinById} style={{ marginTop: 8 }} />
        )}
        {join.error && <ThemedText style={styles.error}>{(join.error as Error).message}</ThemedText>}
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  error: { color: 'tomato', marginTop: 8 },
  muted: { color: colors.textSecondary, marginTop: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginTop: 8
  },
  label: { color: colors.textSecondary, marginBottom: 6 },
  formGroup: { marginTop: 10 },
  formGroupRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  groupRow: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.border
  },
  groupLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  groupIcon: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary
  },
  groupName: { fontWeight: '700', fontSize: 15 },
  groupMeta: { color: colors.textSecondary, fontSize: 12, marginTop: 2 },
  groupId: { color: colors.textSecondary, fontSize: 11, marginTop: 2 }
});
