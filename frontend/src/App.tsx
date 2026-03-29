import { NavigationContainer, DefaultTheme, Theme } from '@react-navigation/native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StatusBar } from 'expo-status-bar';
import { useMemo } from 'react';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { AppNavigator } from './navigation/AppNavigator';
import { AuthProvider } from './providers/AuthProvider';
import { ThemeProvider } from './providers/ThemeProvider';
import { colors } from './theme';

const queryClient = new QueryClient();

export default function App() {
  const navTheme: Theme = useMemo(
    () => ({
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        background: colors.bg,
        card: colors.glass,
        text: colors.textPrimary,
        primary: colors.primary,
        border: colors.border,
        notification: colors.primary
      }
    }),
    []
  );

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <AuthProvider>
            <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }} edges={['top']}>
              <NavigationContainer theme={navTheme}>
                <StatusBar style="light" />
                <AppNavigator />
              </NavigationContainer>
            </SafeAreaView>
          </AuthProvider>
        </QueryClientProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
