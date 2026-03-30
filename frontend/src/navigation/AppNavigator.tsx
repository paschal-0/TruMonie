import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import React from 'react';

import { useAuth } from '../providers/AuthProvider';
import { SplashScreen } from '../screens/SplashScreen';
import { AuthStack } from './AuthStack';
import { HomeScreen } from '../screens/HomeScreen';
import { WalletScreen } from '../screens/WalletScreen';
import { AjoScreen } from '../screens/AjoScreen';
import { RemitScreen } from '../screens/RemitScreen';
import { CardsScreen } from '../screens/CardsScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BillsScreen } from '../screens/BillsScreen';
import { SavingsScreen } from '../screens/SavingsScreen';
import { FxScreen } from '../screens/FxScreen';

const Tab = createBottomTabNavigator();
const RootStack = createNativeStackNavigator();

function MainTabs() {
  return (
    <Tab.Navigator
      id="main-tabs"
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#0f766e',
        tabBarIcon: ({ color, size }) => {
          const icons: Record<string, keyof typeof Ionicons.glyphMap> = {
            Home: 'home',
            Wallet: 'wallet',
            Ajo: 'people',
            Remit: 'send',
            Cards: 'card-outline',
            Settings: 'settings-outline'
          };
          const name = icons[route.name] ?? 'ellipse';
          return <Ionicons name={name} size={size} color={color} />;
        }
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Wallet" component={WalletScreen} />
      <Tab.Screen name="Ajo" component={AjoScreen} />
      <Tab.Screen name="Remit" component={RemitScreen} />
      <Tab.Screen name="Cards" component={CardsScreen} />
      <Tab.Screen name="Settings" component={SettingsScreen} />
    </Tab.Navigator>
  );
}

export function AppNavigator() {
  const { session, hydrating } = useAuth();
  return (
    <RootStack.Navigator id="root-stack" screenOptions={{ headerShown: false }}>
      {hydrating ? (
        <RootStack.Screen name="Splash" component={SplashScreen} />
      ) : session ? (
        <>
          <RootStack.Screen name="Main" component={MainTabs} />
          <RootStack.Screen name="Bills" component={BillsScreen} />
          <RootStack.Screen name="Savings" component={SavingsScreen} />
          <RootStack.Screen name="FX" component={FxScreen} />
        </>
      ) : (
        <>
          <RootStack.Screen name="Auth" component={AuthStack} />
        </>
      )}
    </RootStack.Navigator>
  );
}
