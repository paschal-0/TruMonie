import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import { useNavigation } from '@react-navigation/native';

import { ThemedText } from '../components/Themed';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { useAuth } from '../providers/AuthProvider';
import {
  CreateMerchantPayload,
  isMerchantEndpointUnavailable,
  useCreateMerchant
} from '../hooks/useMerchant';

type MerchantType = 'SOLE_PROPRIETORSHIP' | 'LLC' | 'PLC';

const businessTypes: MerchantType[] = ['SOLE_PROPRIETORSHIP', 'LLC', 'PLC'];

export const MerchantOnboardingScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session } = useAuth();
  const createMerchant = useCreateMerchant(session?.accessToken);

  const [form, setForm] = useState({
    businessName: '',
    businessType: 'SOLE_PROPRIETORSHIP' as MerchantType,
    categoryCode: '',
    tin: '',
    rcNumber: '',
    settlementAccount: '',
    settlementBank: '',
    street: '',
    city: '',
    state: '',
    country: 'NG',
    lat: '6.5244',
    lng: '3.3792',
    geoFenceRadius: '10'
  });

  const update = (key: keyof typeof form, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const parseAndValidatePayload = (): CreateMerchantPayload | null => {
    if (!form.businessName.trim()) {
      Alert.alert('Validation', 'Business name is required.');
      return null;
    }
    if (!form.categoryCode.trim()) {
      Alert.alert('Validation', 'Category code (MCC) is required.');
      return null;
    }
    if (!form.settlementAccount.trim() || form.settlementAccount.trim().length < 10) {
      Alert.alert('Validation', 'Settlement account must be at least 10 digits.');
      return null;
    }
    if (!form.settlementBank.trim()) {
      Alert.alert('Validation', 'Settlement bank code is required.');
      return null;
    }
    if (!form.street.trim() || !form.city.trim() || !form.state.trim()) {
      Alert.alert('Validation', 'Business address fields are required.');
      return null;
    }
    const lat = Number(form.lat);
    const lng = Number(form.lng);
    const radiusMeters = Number(form.geoFenceRadius);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      Alert.alert('Validation', 'Valid latitude and longitude are required.');
      return null;
    }
    if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
      Alert.alert('Validation', 'Geo-fence radius must be greater than 0.');
      return null;
    }

    return {
      business_name: form.businessName.trim(),
      business_type: form.businessType,
      category_code: form.categoryCode.trim(),
      tin: form.tin.trim() || undefined,
      rc_number: form.rcNumber.trim() || undefined,
      settlement_account: form.settlementAccount.trim(),
      settlement_bank: form.settlementBank.trim(),
      address: {
        street: form.street.trim(),
        city: form.city.trim(),
        state: form.state.trim(),
        country: form.country.trim() || 'NG'
      },
      geo_location: {
        lat,
        lng
      },
      geo_fence_radius: Math.round(radiusMeters)
    };
  };

  const submit = () => {
    const payload = parseAndValidatePayload();
    if (!payload) return;
    createMerchant.mutate(payload, {
      onSuccess: (result) => {
        Alert.alert(
          'Merchant Submitted',
          `Status: ${result.status ?? 'PENDING'}\nMerchant ID: ${result.merchant_id ?? 'N/A'}`
        );
        navigation.navigate('MerchantHub');
      }
    });
  };

  const endpointUnavailable =
    createMerchant.isError && isMerchantEndpointUnavailable(createMerchant.error);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.select({ ios: 'padding', android: undefined })}
    >
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText style={styles.heading}>Merchant Onboarding</ThemedText>
        <ThemedText style={styles.subheading}>
          Submit your business profile to enable POS acceptance and settlement flows.
        </ThemedText>

        <GlassCard style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Business Details</ThemedText>
          <ThemedText style={styles.label}>Business Name</ThemedText>
          <TextInput
            style={styles.input}
            value={form.businessName}
            onChangeText={(text) => update('businessName', text)}
            placeholder="e.g. Mama Nkechi Stores"
            placeholderTextColor={colors.textSecondary}
          />

          <ThemedText style={styles.label}>Business Type</ThemedText>
          <View style={styles.chipRow}>
            {businessTypes.map((type) => {
              const selected = form.businessType === type;
              return (
                <TouchableOpacity
                  key={type}
                  style={[styles.chip, selected ? styles.chipActive : undefined]}
                  onPress={() => update('businessType', type)}
                  activeOpacity={0.85}
                >
                  <ThemedText style={[styles.chipText, selected ? styles.chipTextActive : undefined]}>
                    {type.replace('_', ' ')}
                  </ThemedText>
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Category Code (MCC)</ThemedText>
              <TextInput
                style={styles.input}
                value={form.categoryCode}
                onChangeText={(text) => update('categoryCode', text)}
                placeholder="5411"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>RC Number</ThemedText>
              <TextInput
                style={styles.input}
                value={form.rcNumber}
                onChangeText={(text) => update('rcNumber', text)}
                placeholder="Optional"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>

          <ThemedText style={styles.label}>TIN (for corporates)</ThemedText>
          <TextInput
            style={styles.input}
            value={form.tin}
            onChangeText={(text) => update('tin', text)}
            placeholder="Optional for sole proprietorship"
            placeholderTextColor={colors.textSecondary}
          />
        </GlassCard>

        <GlassCard style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Settlement Details</ThemedText>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Settlement Account</ThemedText>
              <TextInput
                style={styles.input}
                value={form.settlementAccount}
                onChangeText={(text) => update('settlementAccount', text.replace(/[^0-9]/g, ''))}
                keyboardType="number-pad"
                placeholder="0123456789"
                placeholderTextColor={colors.textSecondary}
                maxLength={12}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Bank Code</ThemedText>
              <TextInput
                style={styles.input}
                value={form.settlementBank}
                onChangeText={(text) => update('settlementBank', text)}
                placeholder="058"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
        </GlassCard>

        <GlassCard style={styles.card}>
          <ThemedText style={styles.sectionTitle}>Business Address & Geo-fence</ThemedText>
          <ThemedText style={styles.label}>Street</ThemedText>
          <TextInput
            style={styles.input}
            value={form.street}
            onChangeText={(text) => update('street', text)}
            placeholder="25 Broad Street"
            placeholderTextColor={colors.textSecondary}
          />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>City</ThemedText>
              <TextInput
                style={styles.input}
                value={form.city}
                onChangeText={(text) => update('city', text)}
                placeholder="Lagos Island"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>State</ThemedText>
              <TextInput
                style={styles.input}
                value={form.state}
                onChangeText={(text) => update('state', text)}
                placeholder="Lagos"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Latitude</ThemedText>
              <TextInput
                style={styles.input}
                value={form.lat}
                onChangeText={(text) => update('lat', text)}
                placeholder="6.5244"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
            <View style={{ flex: 1 }}>
              <ThemedText style={styles.label}>Longitude</ThemedText>
              <TextInput
                style={styles.input}
                value={form.lng}
                onChangeText={(text) => update('lng', text)}
                placeholder="3.3792"
                placeholderTextColor={colors.textSecondary}
              />
            </View>
          </View>
          <ThemedText style={styles.label}>Geo-fence Radius (meters)</ThemedText>
          <TextInput
            style={styles.input}
            value={form.geoFenceRadius}
            onChangeText={(text) => update('geoFenceRadius', text.replace(/[^0-9]/g, ''))}
            keyboardType="number-pad"
            placeholder="10"
            placeholderTextColor={colors.textSecondary}
          />
        </GlassCard>

        {createMerchant.isError ? (
          <GlassCard>
            <ThemedText style={styles.error}>
              {endpointUnavailable
                ? 'Merchant API is not available on this backend yet. Add merchant endpoints and retry.'
                : (createMerchant.error as Error).message}
            </ThemedText>
          </GlassCard>
        ) : null}

        {createMerchant.isPending ? (
          <GlassCard>
            <ActivityIndicator color={colors.accent} />
          </GlassCard>
        ) : (
          <GradientButton title="Submit Merchant Profile" onPress={submit} />
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.bg
  },
  content: {
    padding: 18,
    gap: 12
  },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary
  },
  subheading: {
    color: colors.textSecondary
  },
  card: {
    gap: 8
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2
  },
  label: {
    color: colors.textSecondary,
    marginTop: 6
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  row: {
    flexDirection: 'row',
    gap: 10
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2
  },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  chipActive: {
    borderColor: colors.accent,
    backgroundColor: 'rgba(79,224,193,0.12)'
  },
  chipText: {
    color: colors.textSecondary,
    fontSize: 12,
    fontWeight: '700'
  },
  chipTextActive: {
    color: colors.accent
  },
  error: {
    color: 'tomato'
  }
});

