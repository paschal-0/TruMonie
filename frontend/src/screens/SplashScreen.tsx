import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { ThemedText } from '../components/Themed';

const shield = require('../../assets/trumoni-logo.png');

export const SplashScreen: React.FC = () => {
  const shieldScale = useRef(new Animated.Value(0.7)).current;
  const shieldOpacity = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(1)).current;
  const bounce = useRef(new Animated.Value(0)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const taglineY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(shieldOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true
      }),
      Animated.spring(shieldScale, { toValue: 1, friction: 6, tension: 120, useNativeDriver: true }),
      Animated.delay(120),
      Animated.parallel([
        Animated.timing(taglineOpacity, { toValue: 1, duration: 360, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.spring(taglineY, { toValue: 0, friction: 7, tension: 80, useNativeDriver: true })
      ])
    ]).start(() => {
      Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(pulse, { toValue: 1.05, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(pulse, { toValue: 0.98, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
          ]),
          Animated.sequence([
            Animated.timing(bounce, { toValue: -10, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            Animated.timing(bounce, { toValue: 0, duration: 650, easing: Easing.inOut(Easing.ease), useNativeDriver: true })
          ])
        ])
      ).start();
    });
  }, [bounce, pulse, shieldOpacity, shieldScale, taglineOpacity, taglineY]);

  return (
    <View style={styles.container}>
      <Animated.View
        style={{
          opacity: shieldOpacity,
          transform: [
            { scale: Animated.multiply(shieldScale, pulse) },
            { translateY: bounce },
            // Counter-rotate slightly to level the wordmark inside the logo
            { rotate: '-3deg' }
          ]
        }}
      >
        <Image source={shield} style={styles.shield} resizeMode="contain" />
      </Animated.View>
      <Animated.View
        style={[
          styles.taglineWrap,
          {
            opacity: taglineOpacity,
            transform: [{ translateY: taglineY }]
          }
        ]}
      >
        <ThemedText style={styles.tagline}>Your Money. Your Trust.</ThemedText>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center'
  },
  shield: {
    width: 9000,
    height: 250
  },
  taglineWrap: {
    position: 'absolute',
    bottom: '18%'
  },
  tagline: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0f766e',
    letterSpacing: 0.3
  }
});
