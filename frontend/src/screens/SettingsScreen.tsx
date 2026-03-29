import React, { useState } from 'react';
import { Image, ScrollView, StyleSheet, Switch, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { ThemedText } from '../components/Themed';
import { useAuth } from '../providers/AuthProvider';
import { GlassCard } from '../components/GlassCard';
import { GradientButton } from '../components/GradientButton';
import { colors, radius } from '../theme';

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

export const SettingsScreen: React.FC = () => {
  const { logout } = useAuth();
  const [faceId, setFaceId] = useState(true);
  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);

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
        <ThemedText style={styles.name}>Alex Morgan</ThemedText>
        <ThemedText style={styles.member}>TruMoni Member since 2023</ThemedText>
        <GradientButton title="Edit Profile" onPress={() => {}} style={{ marginTop: 10, width: 180 }} />
      </View>

      <Section title="Security">
        <Row
          icon="finger-print"
          title="Face ID Login"
          subtitle="Secure access"
          right={<Switch value={faceId} onValueChange={setFaceId} thumbColor="#fff" trackColor={{ true: colors.accent, false: '#4b5563' }} />}
        />
        <Row icon="lock-closed" title="Change PIN" onPress={() => {}} />
        <Row icon="laptop" title="Trusted Devices" subtitle="iPhone, iPad" onPress={() => {}} />
      </Section>

      <Section title="Notifications">
        <Row
          icon="notifications"
          title="Push Notifications"
          right={<Switch value={push} onValueChange={setPush} thumbColor="#fff" trackColor={{ true: colors.accent, false: '#4b5563' }} />}
        />
        <Row
          icon="mail"
          title="Email Alerts"
          right={<Switch value={email} onValueChange={setEmail} thumbColor="#fff" trackColor={{ true: colors.accent, false: '#4b5563' }} />}
        />
      </Section>

      <Section title="Preferences">
        <Row icon="cash-outline" title="Currency" subtitle="USD ($)" onPress={() => {}} />
        <Row icon="language" title="Language" subtitle="English" onPress={() => {}} />
      </Section>

      <Section title="Support & Legal">
        <Row icon="help-circle" title="Help Center" onPress={() => {}} />
        <Row icon="document-text" title="Legal & Privacy" onPress={() => {}} />
      </Section>

      <ThemedText style={styles.build}>TruMoni v2.4.0 (Build 4921)</ThemedText>

      <TouchableOpacity style={styles.logout} activeOpacity={0.9} onPress={() => logout()}>
        <Ionicons name="log-out-outline" size={18} color="#f87171" />
        <ThemedText style={styles.logoutText}>Log Out</ThemedText>
      </TouchableOpacity>
    </ScrollView>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={{ marginTop: 20 }}>
    <ThemedText style={styles.sectionHeading}>{title}</ThemedText>
    <GlassCard style={{ marginTop: 10, paddingHorizontal: 0 }}>
      {children}
    </GlassCard>
  </View>
);

const styles = StyleSheet.create({
  container: { padding: 18, gap: 12, backgroundColor: colors.bg },
  heading: { fontSize: 24, fontWeight: '800', color: colors.textPrimary, textAlign: 'center', marginBottom: 4 },
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
  kicker: { color: colors.textSecondary, fontSize: 13 },
  big: { fontSize: 18, fontWeight: '800', marginTop: 4 },
  heroIcon: {
    width: 44,
    height: 44,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center'
  },
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
