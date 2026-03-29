import React from 'react';
import { View, StyleSheet, ViewProps } from 'react-native';
import { colors, radius, shadows } from '../theme';

export const GlassCard: React.FC<ViewProps> = ({ style, children, ...rest }) => {
  return (
    <View style={[styles.card, style]} {...rest}>
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.glass,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 18,
    ...shadows.soft
  }
});
