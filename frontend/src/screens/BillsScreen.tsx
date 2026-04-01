import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { ThemedText } from '../components/Themed';
import {
  BillPayResponse,
  useBillBeneficiaries,
  useBillCategories,
  useBillDeleteBeneficiary,
  useBillNqrPay,
  useBillPay,
  useBillSaveBeneficiary,
  useBillValidate
} from '../hooks/useBills';
import { useSetTransactionPin, useTransactionPinStatus } from '../hooks/useTransactionPin';
import { useWallets } from '../hooks/useWallets';
import { useAuth } from '../providers/AuthProvider';
import { colors, radius } from '../theme';

type ReceiptState = {
  mode: 'BILL' | 'NQR';
  data: BillPayResponse | {
    payment_id: string;
    merchant_name: string;
    amount: number;
    status: string;
    session_id?: string | null;
  };
} | null;

function generateIdempotency(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1_000_000)
    .toString()
    .padStart(6, '0')}`;
}

function nairaToMinor(value: string): number {
  const cleaned = value.replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) return 0;
  return Math.round(parsed * 100);
}

function formatMinor(minor: number): string {
  return (minor / 100).toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
}

export const BillsScreen: React.FC = () => {
  const { session } = useAuth();
  const token = session?.accessToken;

  const categoriesQuery = useBillCategories();
  const beneficiariesQuery = useBillBeneficiaries(token);
  const walletsQuery = useWallets(token);
  const pinStatus = useTransactionPinStatus(token);
  const pinSetupMutation = useSetTransactionPin(token);
  const validateMutation = useBillValidate(token);
  const payMutation = useBillPay(token);
  const nqrMutation = useBillNqrPay(token);
  const saveBeneficiaryMutation = useBillSaveBeneficiary(token);
  const deleteBeneficiaryMutation = useBillDeleteBeneficiary(token);

  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedBiller, setSelectedBiller] = useState<string>('');
  const [validationFields, setValidationFields] = useState<Record<string, string>>({});
  const [manualCustomerRef, setManualCustomerRef] = useState('');
  const [amountNaira, setAmountNaira] = useState('');
  const [pin, setPin] = useState('');
  const [validation, setValidation] = useState<{
    validation_ref: string;
    customer_name: string | null;
    customer_address: string | null;
    customer_ref: string | null;
    minimum_amount: number;
    valid_until: string;
  } | null>(null);
  const [saveNickname, setSaveNickname] = useState('');
  const [pinSetup, setPinSetup] = useState('');
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showNqrModal, setShowNqrModal] = useState(false);
  const [receipt, setReceipt] = useState<ReceiptState>(null);
  const [nqrQrData, setNqrQrData] = useState('');
  const [nqrAmountNaira, setNqrAmountNaira] = useState('');
  const [nqrPin, setNqrPin] = useState('');

  const categories = categoriesQuery.data?.categories ?? [];

  const selectedCategoryData = useMemo(
    () => categories.find((entry) => entry.id === selectedCategory) ?? null,
    [categories, selectedCategory]
  );

  const selectedBillerData = useMemo(
    () => selectedCategoryData?.billers.find((entry) => entry.id === selectedBiller) ?? null,
    [selectedCategoryData, selectedBiller]
  );

  const ngnWallet = useMemo(
    () => walletsQuery.data?.find((wallet: any) => wallet.currency === 'NGN') ?? null,
    [walletsQuery.data]
  );

  const derivedCustomerRef = useMemo(() => {
    if (!selectedBillerData) return '';
    if (selectedBillerData.requires_validation) {
      return validation?.customer_ref ?? '';
    }
    const firstField = selectedBillerData.validation_fields[0];
    if (firstField && validationFields[firstField]) {
      return validationFields[firstField];
    }
    return manualCustomerRef.trim();
  }, [manualCustomerRef, selectedBillerData, validation?.customer_ref, validationFields]);

  const canValidate = Boolean(
    selectedBillerData &&
      selectedBillerData.requires_validation &&
      selectedBillerData.validation_fields.every((field) => validationFields[field]?.trim())
  );

  const amountMinor = nairaToMinor(amountNaira);
  const feeFreeCategory =
    selectedCategoryData?.id === 'airtime' || selectedCategoryData?.id === 'data';
  const feeMinor = selectedBillerData
    ? feeFreeCategory
      ? 0
      : Math.max(1000, Math.floor(amountMinor / 50))
    : 0;
  const totalMinor = amountMinor + feeMinor;

  const resetForBiller = () => {
    setValidation(null);
    setValidationFields({});
    setManualCustomerRef('');
    setAmountNaira('');
    setPin('');
    setSaveNickname('');
  };

  const onValidate = () => {
    if (!selectedBillerData) {
      Alert.alert('Validation', 'Select a biller first.');
      return;
    }
    if (!canValidate) {
      Alert.alert('Validation', 'Fill all validation fields before continuing.');
      return;
    }
    validateMutation.mutate(
      {
        biller_id: selectedBillerData.id,
        fields: validationFields
      },
      {
        onSuccess: (result) => {
          setValidation(result);
          Alert.alert('Validated', `${result.customer_name ?? 'Customer'} verified successfully.`);
        }
      }
    );
  };

  const onOpenConfirm = () => {
    if (!selectedBillerData) {
      Alert.alert('Validation', 'Select a biller first.');
      return;
    }
    if (!ngnWallet?.id) {
      Alert.alert('Wallet', 'NGN wallet not found.');
      return;
    }
    if (!pinStatus.data?.hasTransactionPin) {
      Alert.alert('Transaction PIN', 'Create your transaction PIN before paying bills.');
      return;
    }
    if (amountMinor <= 0) {
      Alert.alert('Validation', 'Enter a valid amount in naira.');
      return;
    }
    if (selectedBillerData.requires_validation && !validation?.validation_ref) {
      Alert.alert('Validation', 'Validate customer details before payment.');
      return;
    }
    if (!selectedBillerData.requires_validation && !derivedCustomerRef) {
      Alert.alert('Validation', 'Enter customer reference (phone/meter/account).');
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      Alert.alert('Validation', 'Enter your 4-digit transaction PIN.');
      return;
    }
    setShowConfirmModal(true);
  };

  const onConfirmPay = () => {
    if (!selectedBillerData || !ngnWallet?.id) return;
    const payload = {
      wallet_id: ngnWallet.id,
      biller_id: selectedBillerData.id,
      validation_ref: validation?.validation_ref,
      customer_ref: selectedBillerData.requires_validation ? undefined : derivedCustomerRef,
      amount: amountMinor,
      currency: 'NGN' as const,
      pin,
      idempotency_key: generateIdempotency('BILL')
    };

    payMutation.mutate(payload, {
      onSuccess: (response) => {
        setReceipt({ mode: 'BILL', data: response });
        setShowConfirmModal(false);
        setShowReceiptModal(true);
      }
    });
  };

  const onSaveBeneficiary = () => {
    if (!selectedBillerData) {
      Alert.alert('Validation', 'Select a biller first.');
      return;
    }
    if (!derivedCustomerRef) {
      Alert.alert('Validation', 'No destination available to save.');
      return;
    }
    if (!saveNickname.trim()) {
      Alert.alert('Validation', 'Enter a nickname.');
      return;
    }
    saveBeneficiaryMutation.mutate({
      productCode: selectedBillerData.id,
      destination: derivedCustomerRef,
      nickname: saveNickname.trim()
    });
  };

  const onPayNqr = () => {
    if (!ngnWallet?.id) {
      Alert.alert('Wallet', 'NGN wallet not found.');
      return;
    }
    if (!pinStatus.data?.hasTransactionPin) {
      Alert.alert('Transaction PIN', 'Create your transaction PIN before NQR payment.');
      return;
    }
    const nqrAmountMinor = nairaToMinor(nqrAmountNaira);
    if (!nqrQrData.trim()) {
      Alert.alert('Validation', 'Enter QR payload.');
      return;
    }
    if (nqrAmountMinor <= 0) {
      Alert.alert('Validation', 'Enter a valid NQR amount in naira.');
      return;
    }
    if (!/^\d{4}$/.test(nqrPin)) {
      Alert.alert('Validation', 'Enter your 4-digit transaction PIN.');
      return;
    }
    nqrMutation.mutate(
      {
        wallet_id: ngnWallet.id,
        qr_data: nqrQrData.trim(),
        amount: nqrAmountMinor,
        currency: 'NGN',
        pin: nqrPin,
        idempotency_key: generateIdempotency('NQR')
      },
      {
        onSuccess: (response) => {
          setReceipt({ mode: 'NQR', data: response });
          setShowNqrModal(false);
          setShowReceiptModal(true);
          setNqrQrData('');
          setNqrAmountNaira('');
          setNqrPin('');
        }
      }
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.headerRow}>
        <ThemedText style={styles.heading}>Bills & VAS</ThemedText>
        <TouchableOpacity style={styles.nqrChip} onPress={() => setShowNqrModal(true)}>
          <Ionicons name="qr-code-outline" size={18} color={colors.textPrimary} />
          <ThemedText style={styles.nqrChipText}>Pay NQR</ThemedText>
        </TouchableOpacity>
      </View>

      {!pinStatus.data?.hasTransactionPin ? (
        <GlassCard>
          <ThemedText style={styles.sectionTitle}>Transaction PIN Setup</ThemedText>
          <ThemedText style={styles.muted}>Set your 4-digit PIN to authorize bill payments.</ThemedText>
          <TextInput
            style={styles.input}
            placeholder="Create PIN"
            placeholderTextColor={colors.textSecondary}
            secureTextEntry
            keyboardType="number-pad"
            maxLength={4}
            value={pinSetup}
            onChangeText={setPinSetup}
          />
          {pinSetupMutation.isPending ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <GradientButton
              title="Create PIN"
              onPress={() => {
                if (!/^\d{4}$/.test(pinSetup)) {
                  Alert.alert('Validation', 'PIN must be exactly 4 digits.');
                  return;
                }
                pinSetupMutation.mutate({ pin: pinSetup }, { onSuccess: () => setPinSetup('') });
              }}
              style={{ marginTop: 12 }}
            />
          )}
        </GlassCard>
      ) : null}

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Categories</ThemedText>
        {categoriesQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {categoriesQuery.isError ? (
          <ThemedText style={styles.error}>Failed to load bill categories.</ThemedText>
        ) : null}
        <View style={styles.chipsWrap}>
          {categories.map((category) => (
            <TouchableOpacity
              key={category.id}
              style={[styles.chip, selectedCategory === category.id && styles.chipActive]}
              onPress={() => {
                setSelectedCategory(category.id);
                setSelectedBiller('');
                resetForBiller();
              }}
            >
              <ThemedText style={styles.chipText}>{category.name}</ThemedText>
            </TouchableOpacity>
          ))}
        </View>
      </GlassCard>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Billers</ThemedText>
        {selectedCategoryData ? (
          <View style={styles.billersWrap}>
            {selectedCategoryData.billers.map((biller) => (
              <TouchableOpacity
                key={biller.id}
                style={[styles.billerCard, selectedBiller === biller.id && styles.billerCardActive]}
                onPress={() => {
                  setSelectedBiller(biller.id);
                  resetForBiller();
                }}
              >
                <ThemedText style={styles.billerName}>{biller.name}</ThemedText>
                <ThemedText style={styles.billerMeta}>
                  {biller.requires_validation ? 'Validation required' : 'Direct pay'}
                </ThemedText>
              </TouchableOpacity>
            ))}
          </View>
        ) : (
          <ThemedText style={styles.muted}>Select a category to view billers.</ThemedText>
        )}
      </GlassCard>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Validation & Payment</ThemedText>
        {selectedBillerData ? (
          <>
            {selectedBillerData.validation_fields.length ? (
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Customer Details</ThemedText>
                {selectedBillerData.validation_fields.map((field) => (
                  <TextInput
                    key={field}
                    style={styles.input}
                    placeholder={field.replace(/_/g, ' ').toUpperCase()}
                    placeholderTextColor={colors.textSecondary}
                    value={validationFields[field] ?? ''}
                    onChangeText={(value) =>
                      setValidationFields((prev) => ({ ...prev, [field]: value }))
                    }
                  />
                ))}
              </View>
            ) : null}

            {!selectedBillerData.requires_validation ? (
              <View style={styles.formGroup}>
                <ThemedText style={styles.label}>Customer Reference</ThemedText>
                <TextInput
                  style={styles.input}
                  placeholder="Phone / Meter / Account"
                  placeholderTextColor={colors.textSecondary}
                  value={manualCustomerRef}
                  onChangeText={setManualCustomerRef}
                />
              </View>
            ) : null}

            {selectedBillerData.requires_validation ? (
              <View style={styles.formGroup}>
                {validateMutation.isPending ? (
                  <ActivityIndicator color={colors.accent} />
                ) : (
                  <GradientButton
                    title={validation ? 'Re-Validate Customer' : 'Validate Customer'}
                    onPress={onValidate}
                    disabled={!canValidate}
                  />
                )}
                {validation ? (
                  <View style={styles.validationCard}>
                    <ThemedText style={styles.line}>Name: {validation.customer_name ?? '-'}</ThemedText>
                    <ThemedText style={styles.line}>Ref: {validation.customer_ref ?? '-'}</ThemedText>
                    <ThemedText style={styles.line}>
                      Minimum: ₦{formatMinor(validation.minimum_amount)}
                    </ThemedText>
                    <ThemedText style={styles.line}>
                      Valid until: {new Date(validation.valid_until).toLocaleString()}
                    </ThemedText>
                  </View>
                ) : null}
                {validateMutation.error ? (
                  <ThemedText style={styles.error}>
                    {(validateMutation.error as Error).message}
                  </ThemedText>
                ) : null}
              </View>
            ) : null}

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Amount (₦)</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="5000"
                placeholderTextColor={colors.textSecondary}
                keyboardType="decimal-pad"
                value={amountNaira}
                onChangeText={setAmountNaira}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Transaction PIN</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="4-digit PIN"
                placeholderTextColor={colors.textSecondary}
                secureTextEntry
                keyboardType="number-pad"
                maxLength={4}
                value={pin}
                onChangeText={setPin}
              />
            </View>

            <View style={styles.formGroup}>
              <ThemedText style={styles.label}>Save Beneficiary (Optional)</ThemedText>
              <TextInput
                style={styles.input}
                placeholder="Nickname (e.g. Home Meter)"
                placeholderTextColor={colors.textSecondary}
                value={saveNickname}
                onChangeText={setSaveNickname}
              />
              {saveBeneficiaryMutation.isPending ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <GradientButton
                  title="Save Beneficiary"
                  onPress={onSaveBeneficiary}
                  style={{ marginTop: 10 }}
                />
              )}
            </View>

            {payMutation.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton title="Continue to Confirm" onPress={onOpenConfirm} />
            )}
            {payMutation.error ? (
              <ThemedText style={styles.error}>{(payMutation.error as Error).message}</ThemedText>
            ) : null}
          </>
        ) : (
          <ThemedText style={styles.muted}>Select a biller to continue.</ThemedText>
        )}
      </GlassCard>

      <GlassCard>
        <ThemedText style={styles.sectionTitle}>Saved Beneficiaries</ThemedText>
        {beneficiariesQuery.isLoading ? <ActivityIndicator color={colors.accent} /> : null}
        {!beneficiariesQuery.isLoading && beneficiariesQuery.data?.length === 0 ? (
          <ThemedText style={styles.muted}>No saved beneficiaries yet.</ThemedText>
        ) : null}
        {beneficiariesQuery.data?.map((beneficiary) => (
          <View key={beneficiary.id} style={styles.beneficiaryRow}>
            <TouchableOpacity
              style={{ flex: 1 }}
              onPress={() => {
                setSelectedBiller(beneficiary.productCode);
                setManualCustomerRef(beneficiary.destination);
                setValidation(null);
              }}
            >
              <ThemedText style={styles.line}>{beneficiary.nickname}</ThemedText>
              <ThemedText style={styles.mutedSmall}>
                {beneficiary.productCode} - {beneficiary.destination}
              </ThemedText>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() =>
                deleteBeneficiaryMutation.mutate(beneficiary.id, {
                  onError: (error) => {
                    Alert.alert('Delete failed', (error as Error).message);
                  }
                })
              }
            >
              <Ionicons name="trash-outline" size={18} color="tomato" />
            </TouchableOpacity>
          </View>
        ))}
      </GlassCard>

      <Modal visible={showConfirmModal} transparent animationType="fade" onRequestClose={() => setShowConfirmModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Confirm Payment</ThemedText>
            <ThemedText style={styles.line}>Biller: {selectedBillerData?.name}</ThemedText>
            <ThemedText style={styles.line}>Customer Ref: {derivedCustomerRef || '-'}</ThemedText>
            <ThemedText style={styles.line}>Amount: ₦{formatMinor(amountMinor)}</ThemedText>
            <ThemedText style={styles.line}>Fee: ₦{formatMinor(feeMinor)}</ThemedText>
            <ThemedText style={styles.line}>Total Debit: ₦{formatMinor(totalMinor)}</ThemedText>
            <View style={styles.modalActions}>
              <GradientButton title="Cancel" onPress={() => setShowConfirmModal(false)} style={{ flex: 1 }} />
              <GradientButton title="Confirm & Pay" onPress={onConfirmPay} style={{ flex: 1 }} />
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={showReceiptModal} transparent animationType="fade" onRequestClose={() => setShowReceiptModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>Transaction Receipt</ThemedText>
            {receipt?.mode === 'BILL' ? (
              <>
                <ThemedText style={styles.line}>Ref: {(receipt.data as BillPayResponse).reference}</ThemedText>
                <ThemedText style={styles.line}>Status: {(receipt.data as BillPayResponse).status}</ThemedText>
                <ThemedText style={styles.line}>
                  Amount: ₦{formatMinor((receipt.data as BillPayResponse).amount)}
                </ThemedText>
                <ThemedText style={styles.line}>
                  Fee: ₦{formatMinor((receipt.data as BillPayResponse).fee)}
                </ThemedText>
                {(receipt.data as BillPayResponse).token ? (
                  <ThemedText style={styles.line}>Token: {(receipt.data as BillPayResponse).token}</ThemedText>
                ) : null}
                {(receipt.data as BillPayResponse).units ? (
                  <ThemedText style={styles.line}>Units: {(receipt.data as BillPayResponse).units}</ThemedText>
                ) : null}
              </>
            ) : receipt?.mode === 'NQR' ? (
              <>
                <ThemedText style={styles.line}>
                  Merchant: {(receipt.data as any).merchant_name}
                </ThemedText>
                <ThemedText style={styles.line}>Status: {(receipt.data as any).status}</ThemedText>
                <ThemedText style={styles.line}>
                  Amount: ₦{formatMinor((receipt.data as any).amount)}
                </ThemedText>
                <ThemedText style={styles.line}>
                  Session: {(receipt.data as any).session_id ?? '-'}
                </ThemedText>
              </>
            ) : null}
            <GradientButton title="Close" onPress={() => setShowReceiptModal(false)} style={{ marginTop: 14 }} />
          </View>
        </View>
      </Modal>

      <Modal visible={showNqrModal} transparent animationType="fade" onRequestClose={() => setShowNqrModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <ThemedText style={styles.modalTitle}>NQR Payment</ThemedText>
            <TextInput
              style={styles.input}
              placeholder="Paste NQR payload"
              placeholderTextColor={colors.textSecondary}
              value={nqrQrData}
              onChangeText={setNqrQrData}
            />
            <TextInput
              style={styles.input}
              placeholder="Amount (₦)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="decimal-pad"
              value={nqrAmountNaira}
              onChangeText={setNqrAmountNaira}
            />
            <TextInput
              style={styles.input}
              placeholder="4-digit PIN"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              keyboardType="number-pad"
              maxLength={4}
              value={nqrPin}
              onChangeText={setNqrPin}
            />
            {nqrMutation.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <View style={styles.modalActions}>
                <GradientButton title="Cancel" onPress={() => setShowNqrModal(false)} style={{ flex: 1 }} />
                <GradientButton title="Pay NQR" onPress={onPayNqr} style={{ flex: 1 }} />
              </View>
            )}
            {nqrMutation.error ? (
              <ThemedText style={styles.error}>{(nqrMutation.error as Error).message}</ThemedText>
            ) : null}
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 18,
    gap: 14,
    backgroundColor: colors.bg
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center'
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 10
  },
  muted: {
    color: colors.textSecondary
  },
  mutedSmall: {
    color: colors.textSecondary,
    fontSize: 12
  },
  error: {
    color: 'tomato',
    marginTop: 8
  },
  chipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: 14,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(67, 233, 123, 0.12)'
  },
  chipText: {
    fontWeight: '700'
  },
  billersWrap: {
    gap: 10
  },
  billerCard: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)'
  },
  billerCardActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(67, 233, 123, 0.09)'
  },
  billerName: {
    fontWeight: '700',
    color: colors.textPrimary
  },
  billerMeta: {
    color: colors.textSecondary,
    marginTop: 4
  },
  formGroup: {
    marginTop: 10,
    gap: 8
  },
  label: {
    color: colors.textSecondary
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  validationCard: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 10,
    backgroundColor: 'rgba(255,255,255,0.03)',
    gap: 4
  },
  line: {
    color: colors.textPrimary
  },
  beneficiaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border
  },
  nqrChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: 10,
    paddingVertical: 8
  },
  nqrChipText: {
    fontWeight: '700'
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'center',
    padding: 20
  },
  modalCard: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    padding: 18,
    gap: 8
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    marginBottom: 8
  },
  modalActions: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 10
  }
});
