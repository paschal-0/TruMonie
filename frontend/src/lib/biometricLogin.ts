import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';

const BIOMETRIC_LOGIN_ENABLED_KEY = 'biometric_login_enabled';
const BIOMETRIC_LOGIN_IDENTIFIER_KEY = 'biometric_login_identifier';
const BIOMETRIC_LOGIN_PASSWORD_KEY = 'biometric_login_password';
const BIOMETRIC_LOGIN_READY_KEY = 'biometric_login_ready';

export async function isBiometricLoginAvailable() {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  const isEnrolled = await LocalAuthentication.isEnrolledAsync();
  return hasHardware && isEnrolled;
}

export async function promptBiometric(reason = 'Authenticate to login') {
  return LocalAuthentication.authenticateAsync({
    promptMessage: reason,
    fallbackLabel: 'Use device passcode'
  });
}

export async function setBiometricLoginEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(BIOMETRIC_LOGIN_ENABLED_KEY, enabled ? '1' : '0');
}

export async function getBiometricLoginEnabled() {
  const value = await SecureStore.getItemAsync(BIOMETRIC_LOGIN_ENABLED_KEY);
  return value === '1';
}

export async function saveBiometricLoginCredentials(identifier: string, password: string) {
  await SecureStore.setItemAsync(BIOMETRIC_LOGIN_IDENTIFIER_KEY, identifier, {
    requireAuthentication: true
  });
  await SecureStore.setItemAsync(BIOMETRIC_LOGIN_PASSWORD_KEY, password, {
    requireAuthentication: true
  });
  await SecureStore.setItemAsync(BIOMETRIC_LOGIN_READY_KEY, '1');
}

export async function getBiometricLoginCredentials() {
  const identifier = await SecureStore.getItemAsync(BIOMETRIC_LOGIN_IDENTIFIER_KEY, {
    requireAuthentication: true
  });
  const password = await SecureStore.getItemAsync(BIOMETRIC_LOGIN_PASSWORD_KEY, {
    requireAuthentication: true
  });
  if (!identifier || !password) return null;
  return { identifier, password };
}

export async function getBiometricLoginReady() {
  const value = await SecureStore.getItemAsync(BIOMETRIC_LOGIN_READY_KEY);
  return value === '1';
}

export async function clearBiometricLoginCredentials() {
  await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_IDENTIFIER_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_PASSWORD_KEY);
  await SecureStore.deleteItemAsync(BIOMETRIC_LOGIN_READY_KEY);
  await setBiometricLoginEnabled(false);
}
