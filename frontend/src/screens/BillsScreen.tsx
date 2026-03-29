import React, { useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { ThemedText } from '../components/Themed';
import { useBillsCatalog } from '../hooks/useBillsCatalog';
import { useBillsBeneficiaries } from '../hooks/useBillsBeneficiaries';
import { useAuth } from '../providers/AuthProvider';
import { useBillPurchase } from '../hooks/useMutations';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { Ionicons } from '@expo/vector-icons';

const shortcuts = [
  { label: 'Airtime', icon: 'phone-portrait' },
  { label: 'Data', icon: 'wifi' },
  { label: 'Electricity', icon: 'flash' },
  { label: 'TV', icon: 'tv' }
];

export const BillsScreen: React.FC = () => {
  const { session } = useAuth();
  const { data: catalog, isLoading, isError } = useBillsCatalog();
  const { data: benes, isLoading: beneLoading } = useBillsBeneficiaries(session?.accessToken);
  const purchase = useBillPurchase(session?.accessToken);
  const [form, setForm] = useState({ productCode: '', beneficiary: '', amountMinor: '' });

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>Bills & Utilities</ThemedText>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Shortcuts</ThemedText>
        <View style={styles.shortcuts}>
          {shortcuts.map((s) => (
            <View key={s.label} style={styles.shortcutBtn}>
              <Ionicons name={s.icon as any} size={20} color={colors.textPrimary} />
              <ThemedText style={styles.shortcutText}>{s.label}</ThemedText>
            </View>
          ))}
        </View>
      </GlassCard>

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Catalog</ThemedText>
        {isLoading && <ActivityIndicator color={colors.accent} />}
        {isError && <ThemedText style={styles.error}>Failed to load catalog</ThemedText>}
        {!isLoading &&
          catalog &&
          catalog.map((item) => (
            <ThemedText key={item.code} style={styles.line}>
              {item.name} ({item.category})
            </ThemedText>
          ))}
      </GlassCard>

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Saved Beneficiaries</ThemedText>
        {beneLoading && <ActivityIndicator color={colors.accent} />}
        {benes?.length === 0 && <ThemedText style={styles.muted}>None saved</ThemedText>}
        {benes &&
          benes.map((b: any) => (
            <ThemedText key={b.id} style={styles.line}>
              {b.nickname} - {b.destination}
            </ThemedText>
          ))}
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 16 }}>
        <ThemedText style={styles.sectionTitle}>Purchase</ThemedText>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Product Code</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="e.g. AIRTIME_MTNN"
            placeholderTextColor={colors.textSecondary}
            value={form.productCode}
            onChangeText={(t) => setForm({ ...form, productCode: t })}
          />
        </View>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Beneficiary</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Phone / Meter / Account"
            placeholderTextColor={colors.textSecondary}
            value={form.beneficiary}
            onChangeText={(t) => setForm({ ...form, beneficiary: t })}
          />
        </View>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Amount (minor)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="50000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={form.amountMinor}
              onChangeText={(t) => setForm({ ...form, amountMinor: t })}
            />
          </View>
          <View style={{ width: 90 }}>
            <ThemedText style={styles.label}>Currency</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="NGN"
              placeholderTextColor={colors.textSecondary}
              value="NGN"
              editable={false}
            />
          </View>
        </View>
        {purchase.isLoading ? (
          <ActivityIndicator color={colors.accent} />
        ) : (
          <GradientButton
            title="Pay"
            onPress={() =>
              purchase.mutate({
                productCode: form.productCode,
                beneficiary: form.beneficiary,
                amountMinor: Number(form.amountMinor),
                currency: 'NGN'
              })
            }
            style={{ marginTop: 10 }}
          />
        )}
        {purchase.error && <ThemedText style={styles.error}>{(purchase.error as Error).message}</ThemedText>}
      </GlassCard>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
  error: { color: 'tomato', marginTop: 8 },
  muted: { color: colors.textSecondary },
  line: { marginVertical: 4, fontWeight: '600' },
  shortcuts: { flexDirection: 'row', gap: 12, flexWrap: 'wrap' },
  shortcutBtn: {
    width: '47%',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.04)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  shortcutText: { fontWeight: '700' },
  formGroup: { marginTop: 10 },
  formGroupRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  label: { color: colors.textSecondary, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  }
});
