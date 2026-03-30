import * as SecureStore from 'expo-secure-store';

const TRANSACTION_PIN_KEY = 'transaction_pin';
const BIOMETRIC_TX_ENABLED_KEY = 'biometric_tx_enabled';

export async function saveTransactionPinLocally(pin: string) {
  await SecureStore.setItemAsync(TRANSACTION_PIN_KEY, pin);
}

export async function getStoredTransactionPin() {
  return SecureStore.getItemAsync(TRANSACTION_PIN_KEY);
}

export async function setBiometricTransactionsEnabled(enabled: boolean) {
  await SecureStore.setItemAsync(BIOMETRIC_TX_ENABLED_KEY, enabled ? '1' : '0');
}

export async function getBiometricTransactionsEnabled() {
  const value = await SecureStore.getItemAsync(BIOMETRIC_TX_ENABLED_KEY);
  return value === '1';
}
