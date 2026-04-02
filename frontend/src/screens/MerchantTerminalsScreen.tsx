import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
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
  isMerchantEndpointUnavailable,
  useMerchantProfile,
  useMerchantTerminals,
  useRequestPosTerminal
} from '../hooks/useMerchant';

function statusColor(status?: string) {
  const normalized = String(status ?? '').toUpperCase();
  if (normalized === 'ACTIVE' || normalized === 'ONLINE') return '#10b981';
  if (normalized === 'PENDING' || normalized === 'PROVISIONING') return '#f59e0b';
  if (normalized === 'SUSPENDED' || normalized === 'INACTIVE') return '#ef4444';
  return colors.textSecondary;
}

function formatDate(value?: string) {
  if (!value) return 'N/A';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'N/A';
  return parsed.toLocaleString();
}

export const MerchantTerminalsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();

  const profileQuery = useMerchantProfile(session?.accessToken);
  const hasMerchant = !!profileQuery.data?.id;
  const terminalsQuery = useMerchantTerminals(session?.accessToken, hasMerchant);
  const requestPos = useRequestPosTerminal(session?.accessToken);

  const [showRequestModal, setShowRequestModal] = useState(false);
  const [quantity, setQuantity] = useState('1');
  const [model, setModel] = useState('');
  const [notes, setNotes] = useState('');

  const activeCount = useMemo(
    () =>
      (terminalsQuery.data ?? []).filter((item) =>
        ['ACTIVE', 'ONLINE'].includes(String(item.status ?? '').toUpperCase())
      ).length,
    [terminalsQuery.data]
  );

  const submitPosRequest = () => {
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert('Validation', 'Quantity must be greater than 0.');
      return;
    }
    requestPos.mutate(
      {
        quantity: Math.round(qty),
        model: model.trim() || undefined,
        notes: notes.trim() || undefined
      },
      {
        onSuccess: () => {
          Alert.alert('Request Submitted', 'POS terminal request submitted for review.');
          setShowRequestModal(false);
          setQuantity('1');
          setModel('');
          setNotes('');
        }
      }
    );
  };

  const endpointUnavailable =
    requestPos.isError && isMerchantEndpointUnavailable(requestPos.error);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl
          refreshing={terminalsQuery.isRefetching || profileQuery.isRefetching}
          onRefresh={() => {
            void profileQuery.refetch();
            void terminalsQuery.refetch();
          }}
          tintColor="#fff"
        />
      }
    >
      <View style={styles.header}>
        <ThemedText style={styles.heading}>POS Terminals</ThemedText>
        {hasMerchant ? (
          <TouchableOpacity
            style={styles.requestBtn}
            onPress={() => setShowRequestModal(true)}
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={16} color={colors.accent} />
            <ThemedText style={styles.requestBtnText}>Request</ThemedText>
          </TouchableOpacity>
        ) : null}
      </View>

      {!profileQuery.isLoading && !hasMerchant ? (
        <GlassCard>
          <ThemedText style={styles.emptyTitle}>Merchant profile required</ThemedText>
          <ThemedText style={styles.emptySub}>
            Complete merchant onboarding before requesting or managing POS terminals.
          </ThemedText>
          <GradientButton
            title="Go to Merchant Onboarding"
            onPress={() => navigation.navigate('MerchantOnboarding')}
            style={{ marginTop: 12 }}
          />
        </GlassCard>
      ) : null}

      {profileQuery.isLoading || terminalsQuery.isLoading ? (
        <GlassCard>
          <ActivityIndicator color={colors.accent} />
        </GlassCard>
      ) : null}

      {hasMerchant ? (
        <GlassCard>
          <ThemedText style={styles.kpiLabel}>Active Terminals</ThemedText>
          <ThemedText style={styles.kpiValue}>{activeCount}</ThemedText>
        </GlassCard>
      ) : null}

      {hasMerchant && !terminalsQuery.isLoading && (terminalsQuery.data ?? []).length === 0 ? (
        <GlassCard>
          <ThemedText style={styles.emptySub}>No terminal provisioned yet.</ThemedText>
        </GlassCard>
      ) : null}

      {(terminalsQuery.data ?? []).map((terminal) => (
        <GlassCard key={terminal.id || terminal.terminalId} style={styles.terminalCard}>
          <View style={styles.terminalHead}>
            <ThemedText style={styles.terminalId}>{terminal.terminalId || 'Unassigned TID'}</ThemedText>
            <View style={[styles.statusPill, { borderColor: statusColor(terminal.status) }]}>
              <ThemedText style={[styles.statusText, { color: statusColor(terminal.status) }]}>
                {terminal.status}
              </ThemedText>
            </View>
          </View>
          <ThemedText style={styles.meta}>Model: {terminal.model ?? 'N/A'}</ThemedText>
          <ThemedText style={styles.meta}>Serial: {terminal.serialNumber ?? 'N/A'}</ThemedText>
          <ThemedText style={styles.meta}>PTSA: {terminal.ptsaId ?? 'Pending assignment'}</ThemedText>
          <ThemedText style={styles.meta}>
            Last heartbeat: {formatDate(terminal.lastHeartbeat)}
          </ThemedText>
        </GlassCard>
      ))}

      {(profileQuery.isError || terminalsQuery.isError) && (
        <GlassCard>
          <ThemedText style={styles.error}>Unable to load terminal resources right now.</ThemedText>
        </GlassCard>
      )}

      <Modal
        visible={showRequestModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowRequestModal(false)}
      >
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Request POS Terminal</ThemedText>
            <ThemedText style={styles.label}>Quantity</ThemedText>
            <TextInput
              style={styles.input}
              value={quantity}
              onChangeText={(text) => setQuantity(text.replace(/[^0-9]/g, ''))}
              keyboardType="number-pad"
              placeholder="1"
              placeholderTextColor={colors.textSecondary}
            />
            <ThemedText style={styles.label}>Preferred Model</ThemedText>
            <TextInput
              style={styles.input}
              value={model}
              onChangeText={setModel}
              placeholder="Optional"
              placeholderTextColor={colors.textSecondary}
            />
            <ThemedText style={styles.label}>Notes</ThemedText>
            <TextInput
              style={[styles.input, styles.notesInput]}
              value={notes}
              onChangeText={setNotes}
              placeholder="Business volume, locations, preferred delivery date..."
              placeholderTextColor={colors.textSecondary}
              multiline
            />
            {requestPos.isError ? (
              <ThemedText style={styles.error}>
                {endpointUnavailable
                  ? 'POS request API is not available on this backend yet.'
                  : (requestPos.error as Error).message}
              </ThemedText>
            ) : null}
            {requestPos.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton title="Submit Request" onPress={submitPosRequest} style={{ marginTop: 12 }} />
            )}
            <TouchableOpacity style={styles.modalCancel} onPress={() => setShowRequestModal(false)}>
              <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>
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
    fontWeight: '800'
  },
  requestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  requestBtnText: {
    color: colors.accent,
    fontWeight: '700'
  },
  kpiLabel: {
    color: colors.textSecondary
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: '800',
    marginTop: 4
  },
  terminalCard: {
    gap: 4
  },
  terminalHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10
  },
  terminalId: {
    fontWeight: '800',
    fontSize: 16
  },
  statusPill: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 4
  },
  statusText: {
    fontSize: 12,
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
    color: 'tomato',
    marginTop: 6
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    padding: 18
  },
  modalCard: {
    width: '100%'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 6
  },
  label: {
    color: colors.textSecondary,
    marginTop: 6,
    marginBottom: 4
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  notesInput: {
    minHeight: 90,
    textAlignVertical: 'top'
  },
  modalCancel: {
    alignItems: 'center',
    marginTop: 10
  },
  modalCancelText: {
    color: colors.textSecondary
  }
});

