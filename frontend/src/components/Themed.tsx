import React from 'react';
import { View, Text, ViewProps, TextProps } from 'react-native';
import { colors } from '../theme';

export const ThemedView: React.FC<ViewProps> = ({ style, ...props }) => (
  <View style={[{ backgroundColor: 'transparent' }, style]} {...props} />
);

export const ThemedText: React.FC<TextProps> = ({ style, ...props }) => (
  <Text
    style={[
      {
        color: colors.textPrimary,
        fontFamily: 'System'
      },
      style
    ]}
    {...props}
  />
);
