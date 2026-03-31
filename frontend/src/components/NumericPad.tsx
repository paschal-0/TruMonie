import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { colors, radius } from '../theme';
import { ThemedText } from './Themed';

interface NumericPadProps {
  onDigit: (digit: string) => void;
  onBackspace: () => void;
  onClear?: () => void;
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'clear', '0', 'back'] as const;

export const NumericPad: React.FC<NumericPadProps> = ({ onDigit, onBackspace, onClear }) => {
  return (
    <View style={styles.grid}>
      {KEYS.map((key) => {
        const isAction = key === 'clear' || key === 'back';
        const label = key === 'clear' ? 'CLR' : key === 'back' ? '⌫' : key;
        return (
          <Pressable
            key={key}
            style={({ pressed }) => [styles.key, isAction && styles.actionKey, pressed && styles.pressed]}
            onPress={() => {
              if (key === 'clear') {
                onClear?.();
                return;
              }
              if (key === 'back') {
                onBackspace();
                return;
              }
              onDigit(key);
            }}
          >
            <ThemedText style={[styles.keyText, isAction && styles.actionText]}>{label}</ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  key: {
    width: '31%',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    minHeight: 56
  },
  actionKey: {
    backgroundColor: 'rgba(79,224,193,0.12)'
  },
  keyText: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.textPrimary
  },
  actionText: {
    fontSize: 14,
    letterSpacing: 0.7,
    color: colors.accent
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.98 }]
  }
});
