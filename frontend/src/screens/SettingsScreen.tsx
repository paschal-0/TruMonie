import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';

import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';
import { useProfile } from '../hooks/useProfile';
import { useSetTransactionPin, useTransactionPinStatus } from '../hooks/useTransactionPin';
import { useSetLoginPassword } from '../hooks/useAuthActions';
import {
  getBiometricTransactionsEnabled,
  saveTransactionPinLocally,
  setBiometricTransactionsEnabled
} from '../lib/transactionAuth';

const avatarUri = 'https://i.pravatar.cc/200?img=47';

const Row: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  onPress?: () => void;
}> = ({ icon, title, subtitle, right, onPress }) => (
  <TouchableOpacity style={styles.row} activeOpacity={0.8} onPress={onPress} disabled={!onPress}>
    <View style={styles.rowIcon}>
      <Ionicons name={icon} size={18} color="#fff" />
    </View>
    <View style={{ flex: 1 }}>
      <ThemedText style={styles.rowTitle}>{title}</ThemedText>
      {subtitle ? <ThemedText style={styles.rowSub}>{subtitle}</ThemedText> : null}
    </View>
    {right ?? <Ionicons name="chevron-forward" size={16} color={colors.textSecondary} />}
  </TouchableOpacity>
);

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={{ marginTop: 20 }}>
    <ThemedText style={styles.sectionHeading}>{title}</ThemedText>
    <GlassCard style={{ marginTop: 10, paddingHorizontal: 0 }}>{children}</GlassCard>
  </View>
);

export const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const { session, logout } = useAuth();
  const { data: profile } = useProfile(session?.accessToken);
  const { data: pinStatus } = useTransactionPinStatus(session?.accessToken);
  const setPinMutation = useSetTransactionPin(session?.accessToken);
  const setLoginPasswordMutation = useSetLoginPassword(session?.accessToken);

  const [faceId, setFaceId] = useState(true);
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [showPinForm, setShowPinForm] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [currentPin, setCurrentPin] = useState('');
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [biometricSupported, setBiometricSupported] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);

  const displayName =
    `${profile?.firstName ?? ''} ${profile?.lastName ?? ''}`.trim() || profile?.username || 'TruMoni User';
  const memberLabel = profile?.email || profile?.phoneNumber || 'Secure banking profile';

  useEffect(() => {
    const loadBiometricState = async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      const supported = hasHardware && enrolled;
      setBiometricSupported(supported);
      const enabled = await getBiometricTransactionsEnabled();
      setBiometricEnabled(Boolean(enabled && supported));
    };
    void loadBiometricState();
  }, []);

  const onToggleBiometric = async (value: boolean) => {
    if (value) {
      if (!biometricSupported) {
        Alert.alert(
          'Biometric Unavailable',
          'Biometric authentication is not set up on this device.'
        );
        return;
      }
      const auth = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Enable biometric transaction approvals'
      });
      if (!auth.success) return;
    }
    setBiometricEnabled(value);
    await setBiometricTransactionsEnabled(value);
  };

  const onSavePin = () => {
    if (!/^\d{4}$/.test(newPin)) {
      Alert.alert('Validation', 'PIN must be exactly 4 digits.');
      return;
    }

    if (pinStatus?.hasTransactionPin && !/^\d{4}$/.test(currentPin)) {
      Alert.alert('Validation', 'Enter your current 4-digit PIN to change it.');
      return;
    }

    setPinMutation.mutate(
      {
        pin: newPin,
        currentPin: pinStatus?.hasTransactionPin ? currentPin : undefined
      },
      {
        onSuccess: async () => {
          await saveTransactionPinLocally(newPin);
          Alert.alert('Success', 'Transaction PIN saved.');
          setNewPin('');
          setCurrentPin('');
          setShowPinForm(false);
        }
      }
    );
  };

  const onSaveLoginPassword = () => {
    if (newPassword.length < 8) {
      Alert.alert('Validation', 'Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmNewPassword) {
      Alert.alert('Validation', 'Passwords do not match.');
      return;
    }

    setLoginPasswordMutation.mutate(
      {
        password: newPassword,
        currentPassword: currentPassword.trim() ? currentPassword : undefined
      },
      {
        onSuccess: () => {
          Alert.alert('Success', 'Login password updated.');
          setCurrentPassword('');
          setNewPassword('');
          setConfirmNewPassword('');
          setShowPasswordForm(false);
        }
      }
    );
  };

  const comingSoon = (feature: string) => {
    Alert.alert('Coming Soon', `${feature} will be available in the next release.`);
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <ThemedText style={styles.heading}>Settings</ThemedText>

      <View style={styles.profileWrap}>
        <View style={styles.avatarGlow}>
          <Image source={{ uri: avatarUri }} style={styles.avatar} />
          <View style={styles.avatarBadge}>
            <Ionicons name="settings-sharp" size={12} color="#fff" />
          </View>
        </View>
        <ThemedText style={styles.name}>{displayName}</ThemedText>
        <ThemedText style={styles.member}>{memberLabel}</ThemedText>
        <GradientButton
          title="Edit Profile"
          onPress={() => comingSoon('Profile edit')}
          style={{ marginTop: 10, width: 180 }}
        />
      </View>

      <Section title="Security">
        <Row
          icon="checkmark-done-circle"
          title="Complete KYC"
          subtitle={`Status: ${profile?.kycStatus ?? 'UNVERIFIED'} | Tier: ${profile?.limitTier ?? 'TIER0'}`}
          onPress={() => navigation.navigate('CompleteKyc')}
        />
        <Row
          icon="finger-print"
          title="Face ID Login"
          subtitle="Secure access"
          right={
            <Switch
              value={faceId}
              onValueChange={setFaceId}
              thumbColor="#fff"
              trackColor={{ true: colors.accent, false: '#4b5563' }}
            />
          }
        />
        <Row
          icon="shield-checkmark"
          title="Biometric Transaction Approval"
          subtitle={
            biometricSupported
              ? 'Approve transactions with fingerprint/face'
              : 'Biometric unavailable on this device'
          }
          right={
            <Switch
              value={biometricEnabled}
              onValueChange={(value) => void onToggleBiometric(value)}
              thumbColor="#fff"
              trackColor={{ true: colors.accent, false: '#4b5563' }}
            />
          }
        />
        <Row
          icon="lock-closed"
          title={pinStatus?.hasTransactionPin ? 'Change Transaction PIN' : 'Create Transaction PIN'}
          subtitle={pinStatus?.hasTransactionPin ? 'PIN is set' : 'Required for transfers and payments'}
          onPress={() => setShowPinForm((prev) => !prev)}
        />
        <Row
          icon="key"
          title="Set Login Password"
          subtitle="Set or change your sign-in password"
          onPress={() => setShowPasswordForm((prev) => !prev)}
        />
        {showPasswordForm ? (
          <View style={styles.pinForm}>
            <ThemedText style={styles.rowSub}>Current password (optional for recovery)</ThemedText>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={currentPassword}
              onChangeText={setCurrentPassword}
              placeholder="Current password"
              placeholderTextColor={colors.textSecondary}
            />
            <ThemedText style={[styles.rowSub, { marginTop: 8 }]}>New password</ThemedText>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={newPassword}
              onChangeText={setNewPassword}
              placeholder="New password (min 8 chars)"
              placeholderTextColor={colors.textSecondary}
            />
            <ThemedText style={[styles.rowSub, { marginTop: 8 }]}>Confirm new password</ThemedText>
            <TextInput
              style={styles.input}
              secureTextEntry
              value={confirmNewPassword}
              onChangeText={setConfirmNewPassword}
              placeholder="Confirm new password"
              placeholderTextColor={colors.textSecondary}
            />
            {setLoginPasswordMutation.isError ? (
              <ThemedText style={styles.errorText}>
                {(setLoginPasswordMutation.error as Error).message}
              </ThemedText>
            ) : null}
            {setLoginPasswordMutation.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton title="Save Login Password" onPress={onSaveLoginPassword} style={{ marginTop: 10 }} />
            )}
          </View>
        ) : null}
        {showPinForm ? (
          <View style={styles.pinForm}>
            {pinStatus?.hasTransactionPin ? (
              <>
                <ThemedText style={styles.rowSub}>Current PIN</ThemedText>
                <TextInput
                  style={styles.input}
                  keyboardType="number-pad"
                  secureTextEntry
                  maxLength={4}
                  value={currentPin}
                  onChangeText={setCurrentPin}
                  placeholder="Current 4-digit PIN"
                  placeholderTextColor={colors.textSecondary}
                />
              </>
            ) : null}
            <ThemedText style={styles.rowSub}>{pinStatus?.hasTransactionPin ? 'New PIN' : 'PIN'}</ThemedText>
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              secureTextEntry
              maxLength={4}
              value={newPin}
              onChangeText={setNewPin}
              placeholder="4-digit PIN"
              placeholderTextColor={colors.textSecondary}
            />
            {setPinMutation.isError ? (
              <ThemedText style={styles.errorText}>{(setPinMutation.error as Error).message}</ThemedText>
            ) : null}
            {setPinMutation.isPending ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <GradientButton
                title={pinStatus?.hasTransactionPin ? 'Update PIN' : 'Create PIN'}
                onPress={onSavePin}
                style={{ marginTop: 10 }}
              />
            )}
          </View>
        ) : null}
        <Row
          icon="laptop"
          title="Trusted Devices"
          subtitle="Device management"
          onPress={() => comingSoon('Trusted devices')}
        />
      </Section>

      <Section title="Notifications">
        <Row
          icon="notifications"
          title="Push Notifications"
          right={
            <Switch
              value={push}
              onValueChange={setPush}
              thumbColor="#fff"
              trackColor={{ true: colors.accent, false: '#4b5563' }}
            />
          }
        />
        <Row
          icon="mail"
          title="Email Alerts"
          right={
            <Switch
              value={email}
              onValueChange={setEmail}
              thumbColor="#fff"
              trackColor={{ true: colors.accent, false: '#4b5563' }}
            />
          }
        />
      </Section>

      <Section title="Preferences">
        <Row
          icon="storefront"
          title="Merchant Center"
          subtitle="Onboarding, POS terminals, settlements"
          onPress={() => navigation.navigate('MerchantHub')}
        />
        <Row
          icon="cash-outline"
          title="Currency"
          subtitle="NGN (\u20A6)"
          onPress={() => comingSoon('Currency preferences')}
        />
        <Row
          icon="language"
          title="Language"
          subtitle="English"
          onPress={() => comingSoon('Language preferences')}
        />
      </Section>

      <Section title="Support & Legal">
        <Row icon="help-circle" title="Help Center" onPress={() => comingSoon('Help center')} />
        <Row icon="document-text" title="Legal & Privacy" onPress={() => comingSoon('Legal documents')} />
      </Section>

      <ThemedText style={styles.build}>TruMoni v2.4.0 (Build 4921)</ThemedText>

      <TouchableOpacity style={styles.logout} activeOpacity={0.9} onPress={() => logout()}>
        <Ionicons name="log-out-outline" size={18} color="#f87171" />
        <ThemedText style={styles.logoutText}>Log Out</ThemedText>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, backgroundColor: colors.bg },
  heading: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.textPrimary,
    textAlign: 'center',
    marginBottom: 4
  },
  profileWrap: { alignItems: 'center', marginVertical: 12 },
  avatarGlow: {
    width: 96,
    height: 96,
    borderRadius: 48,
    padding: 3,
    backgroundColor: 'rgba(79,224,193,0.25)',
    alignItems: 'center',
    justifyContent: 'center'
  },
  avatar: { width: 90, height: 90, borderRadius: 45, backgroundColor: 'rgba(255,255,255,0.1)' },
  avatarBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg
  },
  name: { fontSize: 20, fontWeight: '800', marginTop: 10 },
  member: { color: colors.textSecondary, marginTop: 4 },
  sectionHeading: { color: colors.textSecondary, fontSize: 13, letterSpacing: 0.5 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12
  },
  rowIcon: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10
  },
  rowTitle: { fontWeight: '800', fontSize: 14 },
  rowSub: { color: colors.textSecondary, fontSize: 12 },
  pinForm: {
    marginHorizontal: 14,
    marginBottom: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    backgroundColor: 'rgba(255,255,255,0.04)'
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    padding: 12,
    color: colors.textPrimary,
    backgroundColor: 'rgba(255,255,255,0.04)',
    marginTop: 6
  },
  errorText: { color: 'tomato', marginTop: 8 },
  build: { color: colors.textSecondary, textAlign: 'center', marginVertical: 12 },
  logout: {
    marginTop: 6,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#f87171',
    borderRadius: 30,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8
  },
  logoutText: { color: '#f87171', fontWeight: '800' }
});
