import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ThemedText } from '../../components/Themed';
import { useNavigation } from '@react-navigation/native';
import { GradientButton } from '../../components/GradientButton';
import { GlassCard } from '../../components/GlassCard';
import { colors } from '../../theme';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { AuthStackParamList } from '../../navigation/types';

export const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<AuthStackParamList, 'Welcome'>>();

  return (
    <View style={styles.container}>
      <GlassCard>
        <ThemedText style={styles.title}>Welcome to TruMonie</ThemedText>
        <ThemedText style={styles.subtitle}>Banking core for wallet, savings, Ajo and transfers.</ThemedText>
        <View style={styles.actions}>
          <GradientButton title="Create an account" onPress={() => navigation.navigate('OnboardingPhone')} />
          <GradientButton title="I already have an account" onPress={() => navigation.navigate('Login')} />
        </View>
      </GlassCard>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    padding: 24,
    gap: 16,
    backgroundColor: colors.bg
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: colors.textPrimary
  },
  subtitle: {
    fontSize: 16,
    color: colors.textSecondary,
    marginTop: 6
  },
  actions: {
    marginTop: 24,
    gap: 12
  }
});
