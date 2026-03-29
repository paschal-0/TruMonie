import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { useAjoGroups } from '../hooks/useAjoGroups';
import { useAjoCreate, useAjoJoin, useAjoRunCycle } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { Ionicons } from '@expo/vector-icons';

export const AjoScreen: React.FC = () => {
  const { session } = useAuth();
  const { data: groups, isLoading, isError } = useAjoGroups(session?.accessToken);
  const create = useAjoCreate(session?.accessToken);
  const join = useAjoJoin(session?.accessToken);
  const run = useAjoRunCycle(session?.accessToken);
  const [newGroup, setNewGroup] = useState({ name: '', contributionAmountMinor: '', memberTarget: '' });
  const [joinId, setJoinId] = useState('');
  const [runId, setRunId] = useState('');

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>Ajo / Esusu</ThemedText>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Your Groups</ThemedText>
        {isLoading && <ActivityIndicator color={colors.accent} />}
        {isError && <ThemedText style={styles.error}>Failed to load groups</ThemedText>}
        {groups &&
          groups.map((g: any) => (
            <View key={g.id} style={styles.groupRow}>
              <View style={styles.groupLeft}>
                <View style={styles.groupIcon}>
                  <Ionicons name="people" size={18} color="#fff" />
                </View>
                <View>
                  <ThemedText style={styles.groupName}>{g.name}</ThemedText>
                  <ThemedText style={styles.groupMeta}>
                    {g.currency} {g.contributionAmountMinor} · {g.members?.length ?? 0}/{g.memberTarget} members
                  </ThemedText>
                </View>
              </View>
              <ThemedText style={styles.groupStatus}>Active</ThemedText>
            </View>
          ))}
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
        <GradientButton
          title="Create"
          onPress={() =>
            create.mutate({
              name: newGroup.name,
              currency: 'NGN',
              contributionAmountMinor: Number(newGroup.contributionAmountMinor),
              memberTarget: Number(newGroup.memberTarget)
            })
          }
          style={{ marginTop: 10 }}
        />
      </GlassCard>

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Join Group</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Group ID"
          placeholderTextColor={colors.textSecondary}
          value={joinId}
          onChangeText={setJoinId}
        />
        <GradientButton title="Join" onPress={() => join.mutate(joinId)} style={{ marginTop: 8 }} />
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 16 }}>
        <ThemedText style={styles.sectionTitle}>Run Cycle</ThemedText>
        <TextInput
          style={styles.input}
          placeholder="Group ID"
          placeholderTextColor={colors.textSecondary}
          value={runId}
          onChangeText={setRunId}
        />
        <GradientButton title="Run" onPress={() => run.mutate(runId)} style={{ marginTop: 8 }} />
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  error: { color: 'tomato', marginTop: 8 },
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
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10
  },
  groupLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
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
  groupStatus: { color: colors.accent, fontWeight: '700' }
});
