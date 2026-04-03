import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  View
} from 'react-native';

import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { ThemedText } from '../components/Themed';
import {
  useAgencyCashIn,
  useAgencyCashOut,
  useAgencyCommissions,
  useAgencyMetrics,
  useAgencyProfile,
  useAgencyTransactions,
  useCreateAgent,
  useUpdateAgencyWalletConfig
} from '../hooks/useAgency';
import { useAuth } from '../providers/AuthProvider';
import { colors, radius } from '../theme';

function makeIdempotencyKey() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function parseNairaToMinor(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function formatMinor(minor: number | string) {
  const numeric = Number(minor || 0);
  return `₦${(numeric / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

const DEMO_PRINCIPAL_ID = '00000000-0000-0000-0000-000000000001';
const DEMO_SUPER_AGENT_ID = '00000000-0000-0000-0000-000000000002';

export const AgencyScreen: React.FC = () => {
  const { session } = useAuth();
  const profileQuery = useAgencyProfile(session?.accessToken);
  const profile = profileQuery.data;
  const hasAgent = Boolean(profile?.id);

  const metricsQuery = useAgencyMetrics(session?.accessToken, hasAgent);
  const txQuery = useAgencyTransactions(session?.accessToken, 20, hasAgent);
  const commissionsQuery = useAgencyCommissions(session?.accessToken, 20, hasAgent);
  const createAgent = useCreateAgent(session?.accessToken);
  const cashIn = useAgencyCashIn(session?.accessToken);
  const cashOut = useAgencyCashOut(session?.accessToken);
  const updateConfig = useUpdateAgencyWalletConfig(session?.accessToken);

  const [onboardForm, setOnboardForm] = useState({
    businessName: '',
    agentType: 'INDIVIDUAL' as 'INDIVIDUAL' | 'CORPORATE',
    street: '',
    city: '',
    state: '',
    country: 'NG',
    lat: '6.5244',
    lng: '3.3792',
    principalId: DEMO_PRINCIPAL_ID,
    superAgentId: DEMO_SUPER_AGENT_ID,
    floatLimitNaira: '2000000',
    lowBalanceNaira: '20000'
  });

  const [cashInForm, setCashInForm] = useState({
    customerAccount: '',
    amountNaira: '',
    agentPin: ''
  });

  const [cashOutForm, setCashOutForm] = useState({
    customerAccount: '',
    amountNaira: '',
    customerPin: '',
    agentPin: ''
  });

  const [walletConfigForm, setWalletConfigForm] = useState({
    lowBalanceNaira: '',
    floatLimitNaira: '',
    autoFundEnabled: false
  });

  const refreshing = useMemo(
    () =>
      profileQuery.isFetching ||
      metricsQuery.isFetching ||
      txQuery.isFetching ||
      commissionsQuery.isFetching,
    [profileQuery.isFetching, metricsQuery.isFetching, txQuery.isFetching, commissionsQuery.isFetching]
  );

  const onRefresh = async () => {
    await Promise.all([
      profileQuery.refetch(),
      metricsQuery.refetch(),
      txQuery.refetch(),
      commissionsQuery.refetch()
    ]);
  };

  const submitOnboarding = async () => {
    const lat = Number(onboardForm.lat);
    const lng = Number(onboardForm.lng);
    const floatLimit = parseNairaToMinor(onboardForm.floatLimitNaira);
    const lowBalance = parseNairaToMinor(onboardForm.lowBalanceNaira);
    if (!onboardForm.businessName.trim()) {
      Alert.alert('Validation', 'Business name is required.');
      return;
    }
    if (
      !onboardForm.street.trim() ||
      !onboardForm.city.trim() ||
      !onboardForm.state.trim() ||
      !onboardForm.country.trim()
    ) {
      Alert.alert('Validation', 'Business address is required.');
      return;
    }
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert('Validation', 'Latitude and longitude are required.');
      return;
    }
    try {
      await createAgent.mutateAsync({
        business_name: onboardForm.businessName.trim(),
        agent_type: onboardForm.agentType,
        business_address: {
          street: onboardForm.street.trim(),
          city: onboardForm.city.trim(),
          state: onboardForm.state.trim(),
          country: onboardForm.country.trim()
        },
        geo_location: { lat, lng },
        principal_id: onboardForm.principalId.trim(),
        super_agent_id: onboardForm.superAgentId.trim(),
        float_limit: floatLimit ?? undefined,
        low_balance_threshold: lowBalance ?? undefined
      });
      Alert.alert('Submitted', 'Agency profile created. Await admin activation.');
    } catch (error) {
      Alert.alert('Onboarding Failed', (error as Error).message);
    }
  };

  const submitCashIn = async () => {
    if (!profile?.id || !profile.principalId) return;
    const amount = parseNairaToMinor(cashInForm.amountNaira);
    if (!/^\d{10}$/.test(cashInForm.customerAccount.trim())) {
      Alert.alert('Validation', 'Customer account number must be 10 digits.');
      return;
    }
    if (!amount) {
      Alert.alert('Validation', 'Amount must be greater than zero.');
      return;
    }
    if (!/^\d{4,6}$/.test(cashInForm.agentPin.trim())) {
      Alert.alert('Validation', 'Enter your 4-6 digit transaction PIN.');
      return;
    }
    try {
      const result: any = await cashIn.mutateAsync({
        agent_id: profile.id,
        customer_account: cashInForm.customerAccount.trim(),
        amount,
        principal_id: profile.principalId,
        idempotency_key: makeIdempotencyKey(),
        agent_pin: cashInForm.agentPin.trim()
      });
      Alert.alert(
        'Cash-In Successful',
        `Ref: ${result.reference}\nAmount: ${formatMinor(result.amount)}\nCommission: ${formatMinor(result.commission)}`
      );
      setCashInForm({ customerAccount: '', amountNaira: '', agentPin: '' });
    } catch (error) {
      Alert.alert('Cash-In Failed', (error as Error).message);
    }
  };

  const submitCashOut = async () => {
    if (!profile?.id || !profile.principalId) return;
    const amount = parseNairaToMinor(cashOutForm.amountNaira);
    if (!/^\d{10}$/.test(cashOutForm.customerAccount.trim())) {
      Alert.alert('Validation', 'Customer account number must be 10 digits.');
      return;
    }
    if (!amount) {
      Alert.alert('Validation', 'Amount must be greater than zero.');
      return;
    }
    if (!/^\d{4,6}$/.test(cashOutForm.customerPin.trim())) {
      Alert.alert('Validation', 'Customer PIN must be 4-6 digits.');
      return;
    }
    if (!/^\d{4,6}$/.test(cashOutForm.agentPin.trim())) {
      Alert.alert('Validation', 'Agent PIN must be 4-6 digits.');
      return;
    }
    try {
      const result: any = await cashOut.mutateAsync({
        agent_id: profile.id,
        customer_account: cashOutForm.customerAccount.trim(),
        amount,
        principal_id: profile.principalId,
        idempotency_key: makeIdempotencyKey(),
        customer_pin: cashOutForm.customerPin.trim(),
        agent_pin: cashOutForm.agentPin.trim()
      });
      Alert.alert(
        'Cash-Out Successful',
        `Ref: ${result.reference}\nAmount: ${formatMinor(result.amount)}\nCommission: ${formatMinor(result.commission)}`
      );
      setCashOutForm({ customerAccount: '', amountNaira: '', customerPin: '', agentPin: '' });
    } catch (error) {
      Alert.alert('Cash-Out Failed', (error as Error).message);
    }
  };

  const submitWalletConfig = async () => {
    const lowBalance = parseNairaToMinor(walletConfigForm.lowBalanceNaira);
    const floatLimit = parseNairaToMinor(walletConfigForm.floatLimitNaira);
    if (!lowBalance && !floatLimit) {
      Alert.alert('Validation', 'Enter at least one wallet config value.');
      return;
    }
    try {
      await updateConfig.mutateAsync({
        low_balance_threshold: lowBalance ?? undefined,
        float_limit: floatLimit ?? undefined,
        auto_fund_enabled: walletConfigForm.autoFundEnabled
      });
      Alert.alert('Updated', 'Agent wallet config updated.');
      setWalletConfigForm((prev) => ({ ...prev, lowBalanceNaira: '', floatLimitNaira: '' }));
    } catch (error) {
      Alert.alert('Update Failed', (error as Error).message);
    }
  };

  if (profileQuery.isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor="#fff" />}
    >
      <ThemedText style={styles.heading}>Agency Banking</ThemedText>

      {!hasAgent ? (
        <GlassCard>
          <ThemedText style={styles.sectionTitle}>Create Agent Profile</ThemedText>
          <ThemedText style={styles.subtle}>
            Set up your dedicated agent wallet and onboarding profile.
          </ThemedText>
          <ThemedText style={styles.label}>Business Name</ThemedText>
          <TextInput
            style={styles.input}
            value={onboardForm.businessName}
            placeholder="e.g. Faith Finance Point"
            placeholderTextColor={colors.textSecondary}
            onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, businessName: text }))}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Agent Type</ThemedText>
              <TextInput
                style={styles.input}
                value={onboardForm.agentType}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) =>
                  setOnboardForm((prev) => ({
                    ...prev,
                    agentType: text.trim().toUpperCase() === 'CORPORATE' ? 'CORPORATE' : 'INDIVIDUAL'
                  }))
                }
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Country</ThemedText>
              <TextInput
                style={styles.input}
                value={onboardForm.country}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, country: text }))}
              />
            </View>
          </View>
          <ThemedText style={styles.label}>Street</ThemedText>
          <TextInput
            style={styles.input}
            value={onboardForm.street}
            placeholderTextColor={colors.textSecondary}
            onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, street: text }))}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>City</ThemedText>
              <TextInput
                style={styles.input}
                value={onboardForm.city}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, city: text }))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>State</ThemedText>
              <TextInput
                style={styles.input}
                value={onboardForm.state}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, state: text }))}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Lat</ThemedText>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={onboardForm.lat}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, lat: text }))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Lng</ThemedText>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                value={onboardForm.lng}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, lng: text }))}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Float Limit (₦)</ThemedText>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={onboardForm.floatLimitNaira}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, floatLimitNaira: text }))}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Low Balance Alert (₦)</ThemedText>
              <TextInput
                style={styles.input}
                keyboardType="number-pad"
                value={onboardForm.lowBalanceNaira}
                placeholderTextColor={colors.textSecondary}
                onChangeText={(text) => setOnboardForm((prev) => ({ ...prev, lowBalanceNaira: text }))}
              />
            </View>
          </View>
          <GradientButton
            title={createAgent.isPending ? 'Submitting...' : 'Create Agent Profile'}
            onPress={() => void submitOnboarding()}
            style={{ marginTop: 12 }}
          />
          {createAgent.isError ? (
            <ThemedText style={styles.error}>{(createAgent.error as Error).message}</ThemedText>
          ) : null}
        </GlassCard>
      ) : (
        <>
          <GlassCard>
            <ThemedText style={styles.sectionTitle}>Agent Profile</ThemedText>
            <ThemedText style={styles.subtle}>
              {profile?.businessName} ({profile?.agentCode}) - {profile?.status}
            </ThemedText>
            <ThemedText style={styles.meta}>
              Tier: {profile?.tier} | Wallet: {profile?.walletId}
            </ThemedText>
            <ThemedText style={styles.meta}>Principal: {profile?.principalId}</ThemedText>
          </GlassCard>

          <GlassCard>
            <ThemedText style={styles.sectionTitle}>Performance</ThemedText>
            {metricsQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : metricsQuery.data ? (
              <>
                <ThemedText style={styles.kpi}>Wallet: {formatMinor(metricsQuery.data.wallet_balance)}</ThemedText>
                <ThemedText style={styles.meta}>
                  Today Cash-In: {metricsQuery.data.today.cash_in_count} ({formatMinor(metricsQuery.data.today.cash_in_total)})
                </ThemedText>
                <ThemedText style={styles.meta}>
                  Today Cash-Out: {metricsQuery.data.today.cash_out_count} ({formatMinor(metricsQuery.data.today.cash_out_total)})
                </ThemedText>
                <ThemedText style={styles.meta}>
                  Remaining Daily Cash-Out: {formatMinor(metricsQuery.data.today.remaining_cash_out_limit)}
                </ThemedText>
                <ThemedText style={styles.meta}>
                  Weekly Volume: {formatMinor(metricsQuery.data.this_week.total_volume)} | Score: {metricsQuery.data.performance_score}
                </ThemedText>
              </>
            ) : (
              <ThemedText style={styles.subtle}>No metrics yet.</ThemedText>
            )}
          </GlassCard>

          <GlassCard>
            <ThemedText style={styles.sectionTitle}>Cash-In (Customer Deposit)</ThemedText>
            <ThemedText style={styles.label}>Customer Account Number</ThemedText>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              maxLength={10}
              value={cashInForm.customerAccount}
              placeholder="10-digit account"
              placeholderTextColor={colors.textSecondary}
              onChangeText={(text) => setCashInForm((prev) => ({ ...prev, customerAccount: text }))}
            />
            <ThemedText style={styles.label}>Amount (₦)</ThemedText>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={cashInForm.amountNaira}
              placeholder="e.g. 1000"
              placeholderTextColor={colors.textSecondary}
              onChangeText={(text) => setCashInForm((prev) => ({ ...prev, amountNaira: text }))}
            />
            <ThemedText style={styles.label}>Agent Transaction PIN</ThemedText>
            <TextInput
              style={styles.input}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={6}
              value={cashInForm.agentPin}
              placeholder="4-6 digits"
              placeholderTextColor={colors.textSecondary}
              onChangeText={(text) => setCashInForm((prev) => ({ ...prev, agentPin: text }))}
            />
            <GradientButton
              title={cashIn.isPending ? 'Processing...' : 'Process Cash-In'}
              onPress={() => void submitCashIn()}
              style={{ marginTop: 10 }}
            />
          </GlassCard>

          <GlassCard>
            <ThemedText style={styles.sectionTitle}>Cash-Out (Customer Withdrawal)</ThemedText>
            <ThemedText style={styles.label}>Customer Account Number</ThemedText>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              maxLength={10}
              value={cashOutForm.customerAccount}
              placeholder="10-digit account"
              placeholderTextColor={colors.textSecondary}
              onChangeText={(text) => setCashOutForm((prev) => ({ ...prev, customerAccount: text }))}
            />
            <ThemedText style={styles.label}>Amount (₦)</ThemedText>
            <TextInput
              style={styles.input}
              keyboardType="decimal-pad"
              value={cashOutForm.amountNaira}
              placeholder="e.g. 1000"
              placeholderTextColor={colors.textSecondary}
              onChangeText={(text) => setCashOutForm((prev) => ({ ...prev, amountNaira: text }))}
            />
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>Customer PIN</ThemedText>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={6}
                  value={cashOutForm.customerPin}
                  placeholder="4-6 digits"
                  placeholderTextColor={colors.textSecondary}
                  onChangeText={(text) => setCashOutForm((prev) => ({ ...prev, customerPin: text }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>Agent PIN</ThemedText>
                <TextInput
                  style={styles.input}
                  secureTextEntry
                  keyboardType="number-pad"
                  maxLength={6}
                  value={cashOutForm.agentPin}
                  placeholder="4-6 digits"
                  placeholderTextColor={colors.textSecondary}
                  onChangeText={(text) => setCashOutForm((prev) => ({ ...prev, agentPin: text }))}
                />
              </View>
            </View>
            <GradientButton
              title={cashOut.isPending ? 'Processing...' : 'Process Cash-Out'}
              onPress={() => void submitCashOut()}
              style={{ marginTop: 10 }}
            />
          </GlassCard>

          <GlassCard>
            <ThemedText style={styles.sectionTitle}>Wallet Config</ThemedText>
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>Low Balance (₦)</ThemedText>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={walletConfigForm.lowBalanceNaira}
                  placeholder={String((profile?.walletConfig?.lowBalanceThreshold ?? 0) / 100)}
                  placeholderTextColor={colors.textSecondary}
                  onChangeText={(text) =>
                    setWalletConfigForm((prev) => ({ ...prev, lowBalanceNaira: text }))
                  }
                />
              </View>
              <View style={{ flex: 1 }}>
                <ThemedText style={styles.label}>Float Limit (₦)</ThemedText>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  value={walletConfigForm.floatLimitNaira}
                  placeholder={String((profile?.walletConfig?.floatLimit ?? 0) / 100)}
                  placeholderTextColor={colors.textSecondary}
                  onChangeText={(text) =>
                    setWalletConfigForm((prev) => ({ ...prev, floatLimitNaira: text }))
                  }
                />
              </View>
            </View>
            <View style={styles.switchRow}>
              <ThemedText style={styles.label}>Auto-fund enabled</ThemedText>
              <Switch
                value={walletConfigForm.autoFundEnabled}
                onValueChange={(value) =>
                  setWalletConfigForm((prev) => ({ ...prev, autoFundEnabled: value }))
                }
                thumbColor="#fff"
                trackColor={{ true: colors.accent, false: '#4b5563' }}
              />
            </View>
            <GradientButton
              title={updateConfig.isPending ? 'Updating...' : 'Update Wallet Config'}
              onPress={() => void submitWalletConfig()}
              style={{ marginTop: 10 }}
            />
          </GlassCard>

          <GlassCard>
            <ThemedText style={styles.sectionTitle}>Recent Agent Transactions</ThemedText>
            {txQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : txQuery.data?.length ? (
              txQuery.data.slice(0, 6).map((row) => (
                <View key={row.id} style={styles.listRow}>
                  <ThemedText style={styles.listTitle}>{row.type}</ThemedText>
                  <ThemedText style={styles.meta}>{row.reference}</ThemedText>
                  <ThemedText style={styles.meta}>
                    {formatMinor(row.amountMinor)} | {row.status}
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText style={styles.subtle}>No transactions yet.</ThemedText>
            )}
          </GlassCard>

          <GlassCard style={{ marginBottom: 16 }}>
            <ThemedText style={styles.sectionTitle}>Recent Commissions</ThemedText>
            {commissionsQuery.isLoading ? (
              <ActivityIndicator color={colors.accent} />
            ) : commissionsQuery.data?.length ? (
              commissionsQuery.data.slice(0, 6).map((row) => (
                <View key={row.id} style={styles.listRow}>
                  <ThemedText style={styles.listTitle}>{row.transactionType}</ThemedText>
                  <ThemedText style={styles.meta}>
                    {formatMinor(row.commissionAmount)} ({row.status})
                  </ThemedText>
                </View>
              ))
            ) : (
              <ThemedText style={styles.subtle}>No commissions yet.</ThemedText>
            )}
          </GlassCard>
        </>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 14,
    backgroundColor: colors.bg
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.bg
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8
  },
  subtle: {
    color: colors.textSecondary
  },
  meta: {
    color: colors.textSecondary,
    marginTop: 4
  },
  kpi: {
    fontSize: 20,
    fontWeight: '800'
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  label: {
    color: colors.textSecondary,
    marginTop: 10,
    marginBottom: 6
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  error: {
    color: 'tomato',
    marginTop: 8
  },
  switchRow: {
    marginTop: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  listRow: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: 8,
    marginTop: 8
  },
  listTitle: {
    fontWeight: '700'
  }
});

