import React, { useEffect, useMemo, useState } from 'react';
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
import * as LocalAuthentication from 'expo-local-authentication';

import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { useWallets, useWalletAccountNumber } from '../hooks/useWallets';
import { useP2PTransfer, useBankTransfer } from '../hooks/useMutations';
import { GradientButton } from '../components/GradientButton';
import { GlassCard } from '../components/GlassCard';
import { colors, radius } from '../theme';
import { useSetTransactionPin, useTransactionPinStatus } from '../hooks/useTransactionPin';
import {
  getBiometricTransactionsEnabled,
  getStoredTransactionPin,
  saveTransactionPinLocally
} from '../lib/transactionAuth';

type PendingTransfer =
  | {
      type: 'p2p';
      payload: {
        recipientIdentifier: string;
        amountMinor: number;
        currency: string;
        description?: string;
      };
    }
  | {
      type: 'bank';
      payload: {
        bankCode: string;
        accountNumber: string;
        amountMinor: number;
        currency: string;
        narration?: string;
      };
    };

function parseNairaToMinor(value: string) {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.round(parsed * 100);
}

function formatMinor(amountMinor: number | string, currency = 'NGN') {
  const numeric = Number(amountMinor || 0);
  const symbol = currency === 'NGN' ? '\u20A6' : currency === 'USD' ? '$' : '';
  return `${symbol}${(numeric / 100).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })}`;
}

export const WalletScreen: React.FC = () => {
  const { session } = useAuth();
  const { data, isLoading, isError, refetch } = useWallets(session?.accessToken);
  const { data: canonicalAccount } = useWalletAccountNumber(session?.accessToken, 'NGN');
  const { data: pinStatus } = useTransactionPinStatus(session?.accessToken);
  const setPinMutation = useSetTransactionPin(session?.accessToken);
  const p2p = useP2PTransfer(session?.accessToken);
  const bank = useBankTransfer(session?.accessToken);

  const [showPinSetup, setShowPinSetup] = useState(false);
  const [pinSetup, setPinSetup] = useState({ pin: '', currentPin: '' });
  const [receipt, setReceipt] = useState<{
    title: string;
    amountMinor: number;
    currency: string;
    reference?: string;
    beneficiary?: string;
    status?: string;
  } | null>(null);

  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [authPin, setAuthPin] = useState('');
  const [pendingTransfer, setPendingTransfer] = useState<PendingTransfer | null>(null);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [biometricAvailable, setBiometricAvailable] = useState(false);

  const [p2pForm, setP2pForm] = useState({
    recipientIdentifier: '',
    amountNaira: '',
    currency: 'NGN',
    description: ''
  });

  const [bankForm, setBankForm] = useState({
    bankCode: '',
    accountNumber: '',
    amountNaira: '',
    currency: 'NGN',
    narration: ''
  });

  useEffect(() => {
    const loadBiometricState = async () => {
      const enabled = await getBiometricTransactionsEnabled();
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const available = hasHardware && enrolled;
      setBiometricAvailable(available);
      setBiometricEnabled(Boolean(enabled && available));
    };
    void loadBiometricState();
  }, []);

  const totalBalanceMinor =
    data?.reduce((sum: number, wallet: any) => sum + Number(wallet.balanceMinor || 0), 0) ?? 0;

  const activeSummary = useMemo(() => {
    if (!pendingTransfer) return null;
    if (pendingTransfer.type === 'p2p') {
      return {
        title: 'Confirm P2P Transfer',
        to: pendingTransfer.payload.recipientIdentifier,
        amountMinor: pendingTransfer.payload.amountMinor,
        currency: pendingTransfer.payload.currency,
        note: pendingTransfer.payload.description
      };
    }
    return {
      title: 'Confirm Bank Transfer',
      to: pendingTransfer.payload.accountNumber,
      amountMinor: pendingTransfer.payload.amountMinor,
      currency: pendingTransfer.payload.currency,
      note: pendingTransfer.payload.narration
    };
  }, [pendingTransfer]);

  const submitPinSetup = () => {
    if (!/^\d{4}$/.test(pinSetup.pin)) {
      Alert.alert('Validation', 'PIN must be exactly 4 digits.');
      return;
    }
    if (pinStatus?.hasTransactionPin && !/^\d{4}$/.test(pinSetup.currentPin)) {
      Alert.alert('Validation', 'Current PIN is required.');
      return;
    }
    setPinMutation.mutate(
      {
        pin: pinSetup.pin,
        currentPin: pinStatus?.hasTransactionPin ? pinSetup.currentPin : undefined
      },
      {
        onSuccess: async () => {
          await saveTransactionPinLocally(pinSetup.pin);
          Alert.alert('Success', 'Transaction PIN saved.');
          setPinSetup({ pin: '', currentPin: '' });
          setShowPinSetup(false);
        }
      }
    );
  };

  const prepareP2PTransfer = () => {
    if (!pinStatus?.hasTransactionPin) {
      Alert.alert('Transaction PIN Required', 'Create your 4-digit transaction PIN first.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create PIN', onPress: () => setShowPinSetup(true) }
      ]);
      return;
    }
    const amountMinor = parseNairaToMinor(p2pForm.amountNaira);
    if (!p2pForm.recipientIdentifier.trim()) {
      Alert.alert('Validation', 'Recipient is required.');
      return;
    }
    if (!amountMinor) {
      Alert.alert('Validation', 'Amount must be greater than 0.');
      return;
    }
    setPendingTransfer({
      type: 'p2p',
      payload: {
        recipientIdentifier: p2pForm.recipientIdentifier.trim(),
        amountMinor,
        currency: p2pForm.currency,
        description: p2pForm.description.trim() || undefined
      }
    });
    setShowConfirmModal(true);
  };

  const prepareBankTransfer = () => {
    if (!pinStatus?.hasTransactionPin) {
      Alert.alert('Transaction PIN Required', 'Create your 4-digit transaction PIN first.', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Create PIN', onPress: () => setShowPinSetup(true) }
      ]);
      return;
    }
    const amountMinor = parseNairaToMinor(bankForm.amountNaira);
    if (!bankForm.bankCode.trim()) {
      Alert.alert('Validation', 'Bank code is required.');
      return;
    }
    if (!bankForm.accountNumber.trim()) {
      Alert.alert('Validation', 'Account number is required.');
      return;
    }
    if (!amountMinor) {
      Alert.alert('Validation', 'Amount must be greater than 0.');
      return;
    }
    setPendingTransfer({
      type: 'bank',
      payload: {
        bankCode: bankForm.bankCode.trim(),
        accountNumber: bankForm.accountNumber.trim(),
        amountMinor,
        currency: bankForm.currency,
        narration: bankForm.narration.trim() || undefined
      }
    });
    setShowConfirmModal(true);
  };

  const executeTransferWithPin = async (pin: string) => {
    if (!pendingTransfer) return;
    if (!/^\d{4}$/.test(pin)) {
      Alert.alert('Validation', 'Enter your 4-digit transaction PIN.');
      return;
    }

    try {
      if (pendingTransfer.type === 'p2p') {
        const result: any = await p2p.mutateAsync({
          ...pendingTransfer.payload,
          pin
        });
        setReceipt({
          title: 'P2P Transfer Successful',
          amountMinor: pendingTransfer.payload.amountMinor,
          currency: pendingTransfer.payload.currency,
          reference: result?.reference,
          beneficiary: pendingTransfer.payload.recipientIdentifier,
          status: 'SUCCESS'
        });
        setP2pForm({
          recipientIdentifier: '',
          amountNaira: '',
          currency: 'NGN',
          description: ''
        });
      } else {
        const result: any = await bank.mutateAsync({
          ...pendingTransfer.payload,
          pin
        });
        setReceipt({
          title: 'Bank Transfer Submitted',
          amountMinor: pendingTransfer.payload.amountMinor,
          currency: pendingTransfer.payload.currency,
          reference: result?.providerReference,
          beneficiary: pendingTransfer.payload.accountNumber,
          status: result?.status ?? 'PENDING'
        });
        setBankForm({
          bankCode: '',
          accountNumber: '',
          amountNaira: '',
          currency: 'NGN',
          narration: ''
        });
      }
      await saveTransactionPinLocally(pin);
      setAuthPin('');
      setShowAuthModal(false);
      setPendingTransfer(null);
      void refetch();
    } catch (error) {
      Alert.alert('Transaction Failed', (error as Error)?.message ?? 'Unable to complete transfer.');
    }
  };

  const authorizeWithBiometric = async () => {
    if (!biometricEnabled || !biometricAvailable) {
      Alert.alert('Biometric Unavailable', 'Enable biometric transaction approval in Settings.');
      return;
    }
    const auth = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authorize this transaction'
    });
    if (!auth.success) return;
    const storedPin = await getStoredTransactionPin();
    if (!storedPin) {
      Alert.alert('PIN Needed', 'No saved PIN found. Enter PIN once to continue.');
      return;
    }
    await executeTransferWithPin(storedPin);
  };

  const isSubmitting = p2p.isPending || bank.isPending;

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} tintColor="#fff" />}
    >
      <ThemedText style={styles.heading}>Wallet</ThemedText>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Primary Account Number</ThemedText>
        <ThemedText style={styles.accountNumberHero}>
          {canonicalAccount?.accountNumber ?? 'Not available yet'}
        </ThemedText>
      </GlassCard>

      <GlassCard style={styles.heroCard}>
        <ThemedText style={styles.kicker}>Total Balance</ThemedText>
        <ThemedText style={styles.bigBalance}>{formatMinor(totalBalanceMinor, 'NGN')}</ThemedText>
        <View style={styles.balancePills}>
          {!isLoading &&
            data?.map((wallet: any) => (
              <View key={wallet.id} style={styles.pill}>
                <ThemedText style={styles.pillLabel}>{wallet.currency}</ThemedText>
                <ThemedText style={styles.pillValue}>
                  {formatMinor(wallet.balanceMinor, wallet.currency)}
                </ThemedText>
                {wallet.availableBalanceMinor !== undefined ? (
                  <ThemedText style={styles.accountNumber}>
                    Available: {formatMinor(wallet.availableBalanceMinor, wallet.currency)}
                  </ThemedText>
                ) : null}
                {wallet.accountNumber ? (
                  <ThemedText style={styles.accountNumber}>Acct: {wallet.accountNumber}</ThemedText>
                ) : null}
              </View>
            ))}
        </View>
      </GlassCard>

      {isError && (
        <GlassCard style={{ marginTop: 16 }}>
          <ThemedText style={styles.error}>Failed to load wallet balances.</ThemedText>
        </GlassCard>
      )}

      <GlassCard style={{ marginTop: 16 }}>
        <ThemedText style={styles.sectionTitle}>Send to User (P2P)</ThemedText>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Recipient</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Email, phone, or @username"
            placeholderTextColor={colors.textSecondary}
            value={p2pForm.recipientIdentifier}
            onChangeText={(text) => setP2pForm({ ...p2pForm, recipientIdentifier: text })}
          />
        </View>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Amount (NGN)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={p2pForm.amountNaira}
              onChangeText={(text) => setP2pForm({ ...p2pForm, amountNaira: text })}
            />
          </View>
          <View style={{ width: 90 }}>
            <ThemedText style={styles.label}>Currency</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="NGN"
              placeholderTextColor={colors.textSecondary}
              value={p2pForm.currency}
              onChangeText={(text) => setP2pForm({ ...p2pForm, currency: text.toUpperCase() })}
            />
          </View>
        </View>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Description</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Narration"
            placeholderTextColor={colors.textSecondary}
            value={p2pForm.description}
            onChangeText={(text) => setP2pForm({ ...p2pForm, description: text })}
          />
        </View>
        {p2p.isError ? <ThemedText style={styles.error}>{(p2p.error as Error).message}</ThemedText> : null}
        <GradientButton title="Review & Continue" onPress={prepareP2PTransfer} style={{ marginTop: 10 }} />
      </GlassCard>

      <GlassCard style={{ marginTop: 16, marginBottom: 16 }}>
        <ThemedText style={styles.sectionTitle}>Transfer to Bank</ThemedText>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Bank Code</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="058"
              placeholderTextColor={colors.textSecondary}
              value={bankForm.bankCode}
              onChangeText={(text) => setBankForm({ ...bankForm, bankCode: text })}
            />
          </View>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Account Number</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="0123456789"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              value={bankForm.accountNumber}
              onChangeText={(text) => setBankForm({ ...bankForm, accountNumber: text })}
            />
          </View>
        </View>
        <View style={styles.formGroupRow}>
          <View style={{ flex: 1 }}>
            <ThemedText style={styles.label}>Amount (NGN)</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="e.g. 1000"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={bankForm.amountNaira}
              onChangeText={(text) => setBankForm({ ...bankForm, amountNaira: text })}
            />
          </View>
          <View style={{ width: 90 }}>
            <ThemedText style={styles.label}>Currency</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="NGN"
              placeholderTextColor={colors.textSecondary}
              value={bankForm.currency}
              onChangeText={(text) => setBankForm({ ...bankForm, currency: text.toUpperCase() })}
            />
          </View>
        </View>
        <View style={styles.formGroup}>
          <ThemedText style={styles.label}>Narration</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Invoice 204, thanks!"
            placeholderTextColor={colors.textSecondary}
            value={bankForm.narration}
            onChangeText={(text) => setBankForm({ ...bankForm, narration: text })}
          />
        </View>
        {bank.isError ? <ThemedText style={styles.error}>{(bank.error as Error).message}</ThemedText> : null}
        <GradientButton
          title="Review & Continue"
          onPress={prepareBankTransfer}
          style={{ marginTop: 10 }}
        />
      </GlassCard>

      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => setShowConfirmModal(false)}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>{activeSummary?.title ?? 'Confirm Transfer'}</ThemedText>
            {activeSummary ? (
              <>
                <ThemedText style={styles.receiptLine}>To: {activeSummary.to}</ThemedText>
                <ThemedText style={styles.receiptLine}>
                  Amount: {formatMinor(activeSummary.amountMinor, activeSummary.currency)}
                </ThemedText>
                <ThemedText style={styles.receiptLine}>Currency: {activeSummary.currency}</ThemedText>
                {activeSummary.note ? <ThemedText style={styles.receiptLine}>Note: {activeSummary.note}</ThemedText> : null}
              </>
            ) : null}
            <GradientButton
              title="Confirm & Authorize"
              onPress={() => {
                setShowConfirmModal(false);
                setShowAuthModal(true);
              }}
              style={{ marginTop: 12 }}
            />
            <TouchableOpacity onPress={() => setShowConfirmModal(false)} style={styles.modalCancel}>
              <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>

      <Modal visible={showAuthModal} transparent animationType="fade" onRequestClose={() => setShowAuthModal(false)}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Authorize Transaction</ThemedText>
            <ThemedText style={styles.label}>Transaction PIN</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="4-digit PIN"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={authPin}
              onChangeText={setAuthPin}
            />
            {isSubmitting ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton
                title="Authorize with PIN"
                onPress={() => void executeTransferWithPin(authPin)}
                style={{ marginTop: 12 }}
              />
            )}
            {biometricEnabled && biometricAvailable ? (
              <GradientButton
                title="Authorize with Biometrics"
                onPress={() => void authorizeWithBiometric()}
                style={{ marginTop: 10 }}
              />
            ) : null}
            <TouchableOpacity
              onPress={() => {
                setShowAuthModal(false);
                setAuthPin('');
              }}
              style={styles.modalCancel}
            >
              <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>

      <Modal visible={!!receipt} transparent animationType="fade" onRequestClose={() => setReceipt(null)}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>{receipt?.title}</ThemedText>
            <ThemedText style={styles.receiptLine}>
              Amount: {receipt ? formatMinor(receipt.amountMinor, receipt.currency) : ''}
            </ThemedText>
            {receipt?.beneficiary ? <ThemedText style={styles.receiptLine}>To: {receipt.beneficiary}</ThemedText> : null}
            {receipt?.reference ? <ThemedText style={styles.receiptLine}>Reference: {receipt.reference}</ThemedText> : null}
            {receipt?.status ? <ThemedText style={styles.receiptLine}>Status: {receipt.status}</ThemedText> : null}
            <GradientButton title="Done" onPress={() => setReceipt(null)} style={{ marginTop: 12 }} />
          </GlassCard>
        </View>
      </Modal>

      <Modal visible={showPinSetup} transparent animationType="fade" onRequestClose={() => setShowPinSetup(false)}>
        <View style={styles.modalBackdrop}>
          <GlassCard style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>
              {pinStatus?.hasTransactionPin ? 'Change Transaction PIN' : 'Create Transaction PIN'}
            </ThemedText>
            {pinStatus?.hasTransactionPin ? (
              <>
                <ThemedText style={styles.label}>Current PIN</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Current PIN"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  value={pinSetup.currentPin}
                  onChangeText={(text) => setPinSetup({ ...pinSetup, currentPin: text })}
                />
              </>
            ) : null}
            <ThemedText style={styles.label}>{pinStatus?.hasTransactionPin ? 'New PIN' : 'PIN'}</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="4-digit PIN"
              placeholderTextColor={colors.textSecondary}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={pinSetup.pin}
              onChangeText={(text) => setPinSetup({ ...pinSetup, pin: text })}
            />
            {setPinMutation.isError ? (
              <ThemedText style={styles.error}>{(setPinMutation.error as Error).message}</ThemedText>
            ) : null}
            {setPinMutation.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton
                title={pinStatus?.hasTransactionPin ? 'Update PIN' : 'Create PIN'}
                onPress={submitPinSetup}
                style={{ marginTop: 12 }}
              />
            )}
            <TouchableOpacity onPress={() => setShowPinSetup(false)} style={styles.modalCancel}>
              <ThemedText style={styles.modalCancelText}>Cancel</ThemedText>
            </TouchableOpacity>
          </GlassCard>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 14, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary },
  heroCard: {
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: radius.xl
  },
  kicker: { color: colors.textSecondary, fontSize: 13, marginBottom: 6 },
  bigBalance: { fontSize: 30, fontWeight: '800', letterSpacing: -0.4 },
  accountNumberHero: { fontSize: 24, fontWeight: '800', letterSpacing: 1 },
  balancePills: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  pill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: colors.border
  },
  pillLabel: { fontSize: 12, color: colors.textSecondary },
  pillValue: { fontWeight: '700' },
  accountNumber: { marginTop: 4, fontSize: 11, color: colors.textSecondary },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 10 },
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
  },
  error: { color: 'tomato', marginTop: 8 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 18
  },
  modalCard: {
    width: '100%',
    maxWidth: 420
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 8
  },
  modalCancel: {
    alignItems: 'center',
    marginTop: 10
  },
  modalCancelText: {
    color: colors.textSecondary
  },
  receiptLine: {
    color: colors.textSecondary,
    marginTop: 6
  }
});
