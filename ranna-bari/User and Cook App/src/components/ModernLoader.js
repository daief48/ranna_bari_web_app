import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path, G, Defs, RadialGradient, Stop } from 'react-native-svg';

import { useTheme } from '../theme/ThemeProvider';
import { font, radius } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BENGALI_QUOTES = [
  'হাঁড়ির ঢাকনা খোলা হচ্ছে…',
  'খাবারের সুবাস ছড়িয়ে পড়ছে…',
  'হোম কিচেনের তাজা স্বাদ লোড হচ্ছে…',
  'রসনা তৃপ্তির প্রস্তুতি চলছে…',
  'রান্নাঘর থেকে গরম গরম খাবার আসছে…',
];

const ENGLISH_QUOTES = [
  'Opening the pot of aromas…',
  'Gathering authentic home flavours…',
  'Simmering fresh dishes for you…',
  'Crafting handcrafted culinary love…',
  'Serving fresh from neighbourhood kitchens…',
];

/**
 * Animated Culinary Steam Particle
 */
function SteamParticle({ delay = 0, xOffset = 0, style }) {
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.delay(delay),
        Animated.timing(anim, {
          toValue: 1,
          duration: 1800,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
          useNativeDriver: true,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [anim, delay]);

  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [10, -45],
  });

  const translateX = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [xOffset, xOffset + 6, xOffset - 4],
  });

  const opacity = anim.interpolate({
    inputRange: [0, 0.25, 0.7, 1],
    outputRange: [0, 0.85, 0.6, 0],
  });

  const scale = anim.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0.6, 1.2, 1.6],
  });

  return (
    <Animated.View
      style={[
        styles.steamDot,
        style,
        {
          transform: [{ translateY }, { translateX }, { scale }],
          opacity,
        },
      ]}
    />
  );
}

/**
 * Modern, Ultra-Stylish Culinary Page Transition & Loading Screen
 */
export default function ModernLoader({
  visible = true,
  message,
  subtext,
  onFinished,
}) {
  const { colors, isDark } = useTheme();
  const { lang } = useLang();

  // Animation values
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;
  const potBounce = useRef(new Animated.Value(0)).current;
  const shimmerAnim = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.85)).current;
  const ringOpacity = useRef(new Animated.Value(0.4)).current;

  const [quoteIdx, setQuoteIdx] = useState(0);

  // Quote rotation timer
  useEffect(() => {
    if (!visible) return;
    const interval = setInterval(() => {
      setQuoteIdx((prev) => (prev + 1) % BENGALI_QUOTES.length);
    }, 2200);
    return () => clearInterval(interval);
  }, [visible]);

  // Main looped animations
  useEffect(() => {
    if (!visible) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 250,
        useNativeDriver: true,
      }).start(() => onFinished?.());
      return;
    }

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 220,
      useNativeDriver: true,
    }).start();

    // Continuous smooth orbit rotation
    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    // Continuous pot floating bounce
    const bounceLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(potBounce, {
          toValue: -8,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(potBounce, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    // Expanding glow ripples
    const ringLoop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(ringScale, {
            toValue: 1.4,
            duration: 1600,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: true,
          }),
          Animated.timing(ringScale, {
            toValue: 0.85,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(ringOpacity, {
            toValue: 0,
            duration: 1600,
            useNativeDriver: true,
          }),
          Animated.timing(ringOpacity, {
            toValue: 0.4,
            duration: 0,
            useNativeDriver: true,
          }),
        ]),
      ])
    );

    // Shimmer progress bar
    const shimmerLoop = Animated.loop(
      Animated.timing(shimmerAnim, {
        toValue: 1,
        duration: 1400,
        easing: Easing.bezier(0.4, 0, 0.2, 1),
        useNativeDriver: true,
      })
    );

    spinLoop.start();
    bounceLoop.start();
    ringLoop.start();
    shimmerLoop.start();

    return () => {
      spinLoop.stop();
      bounceLoop.stop();
      ringLoop.stop();
      shimmerLoop.stop();
    };
  }, [visible, fadeAnim, spinAnim, potBounce, ringScale, ringOpacity, shimmerAnim, onFinished]);

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const shimmerTranslate = shimmerAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-140, 140],
  });

  const quoteText = useMemo(() => {
    if (message) return message;
    return lang === 'bn' ? BENGALI_QUOTES[quoteIdx] : ENGLISH_QUOTES[quoteIdx];
  }, [message, lang, quoteIdx]);

  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        },
      ]}
    >
      <BlurView
        intensity={Platform.OS === 'android' ? 50 : 35}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />

      {/* Radial ambient warmth backdrop */}
      <LinearGradient
        colors={[
          isDark ? 'rgba(217, 119, 6, 0.22)' : 'rgba(217, 119, 6, 0.14)',
          isDark ? 'rgba(180, 83, 9, 0.08)' : 'rgba(245, 158, 11, 0.06)',
          isDark ? 'rgba(18, 22, 19, 0.88)' : 'rgba(250, 247, 240, 0.85)',
        ]}
        locations={[0, 0.45, 1]}
        start={{ x: 0.5, y: 0.35 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Central Interactive Animation Box */}
      <View style={styles.centerContainer}>
        {/* Expanding Golden Ripple Ring */}
        <Animated.View
          style={[
            styles.rippleRing,
            {
              borderColor: colors.saffron || '#D97706',
              transform: [{ scale: ringScale }],
              opacity: ringOpacity,
            },
          ]}
        />

        {/* Orbiting Golden Spice Particles Ring */}
        <Animated.View
          style={[
            styles.orbitContainer,
            {
              transform: [{ rotate: spin }],
            },
          ]}
        >
          <View style={[styles.spiceDot, { top: 0, left: '50%', backgroundColor: colors.saffron || '#D97706' }]} />
          <View style={[styles.spiceDot, { bottom: 0, left: '50%', backgroundColor: colors.primary || '#B45309' }]} />
          <View style={[styles.spiceDot, { left: 0, top: '50%', backgroundColor: colors.sage || '#059669', width: 6, height: 6 }]} />
          <View style={[styles.spiceDot, { right: 0, top: '50%', backgroundColor: '#F59E0B', width: 5, height: 5 }]} />
        </Animated.View>

        {/* Floating Steam Particles */}
        <View style={styles.steamContainer}>
          <SteamParticle delay={0} xOffset={-10} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(217,119,6,0.6)' }} />
          <SteamParticle delay={450} xOffset={0} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(180,83,9,0.7)' }} />
          <SteamParticle delay={900} xOffset={12} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(245,158,11,0.6)' }} />
        </View>

        {/* Central Glowing Culinary Pot Icon */}
        <Animated.View
          style={[
            styles.potCard,
            {
              backgroundColor: isDark ? 'rgba(34, 40, 36, 0.92)' : 'rgba(255, 255, 255, 0.95)',
              borderColor: isDark ? 'rgba(217, 119, 6, 0.35)' : 'rgba(217, 119, 6, 0.25)',
              transform: [{ translateY: potBounce }],
            },
          ]}
        >
          <Svg width={54} height={54} viewBox="0 0 24 24" fill="none">
            {/* Pot Body */}
            <Path
              d="M3.6 10.8h16.8v2.4a7.2 7.2 0 0 1-7.2 7.2h-2.4a7.2 7.2 0 0 1-7.2-7.2Z"
              stroke={colors.primary || '#D97706'}
              strokeWidth={1.9}
              strokeLinecap="round"
              strokeLinejoin="round"
              fill={isDark ? 'rgba(217,119,6,0.15)' : 'rgba(217,119,6,0.08)'}
            />
            {/* Pot Rim */}
            <Path
              d="M2 10.8h20"
              stroke={colors.primary || '#D97706'}
              strokeWidth={2.1}
              strokeLinecap="round"
            />
            {/* Pot Handles */}
            <Path
              d="M1.5 12.5C1.5 14 2.8 15 3.6 15"
              stroke={colors.primary || '#D97706'}
              strokeWidth={1.7}
              strokeLinecap="round"
            />
            <Path
              d="M22.5 12.5C22.5 14 21.2 15 20.4 15"
              stroke={colors.primary || '#D97706'}
              strokeWidth={1.7}
              strokeLinecap="round"
            />
            {/* Rising Steam Curves */}
            <Path
              d="M8.5 7.5c0-1.4 1.1-1.8 1.1-3"
              stroke={colors.saffron || '#F59E0B'}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
            <Path
              d="M12 7c0-1.5 1.2-1.9 1.2-3.2"
              stroke={colors.saffron || '#F59E0B'}
              strokeWidth={1.8}
              strokeLinecap="round"
            />
            <Path
              d="M15.5 7.5c0-1.4 1.1-1.8 1.1-3"
              stroke={colors.saffron || '#F59E0B'}
              strokeWidth={1.6}
              strokeLinecap="round"
            />
          </Svg>
        </Animated.View>

        {/* Brand Title */}
        <View style={styles.textContainer}>
          <Text
            style={[
              styles.brandName,
              {
                color: colors.primary || '#D97706',
                fontFamily: font.displayBold || 'Fraunces_700Bold',
              },
            ]}
          >
            RannaBari
          </Text>

          {/* Dynamic Bengali / English Quote */}
          <Text
            key={quoteText}
            style={[
              styles.quoteText,
              {
                color: colors.ink || (isDark ? '#E5E7EB' : '#1F2937'),
                fontFamily: font.uiMedium || 'Inter_500Medium',
              },
            ]}
          >
            {quoteText}
          </Text>

          {subtext ? (
            <Text
              style={[
                styles.subtext,
                {
                  color: colors.ink3 || '#9CA3AF',
                  fontFamily: font.ui || 'Inter_400Regular',
                },
              ]}
            >
              {subtext}
            </Text>
          ) : null}
        </View>

        {/* Shimmering Linear Progress Bar */}
        <View
          style={[
            styles.progressTrack,
            {
              backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
            },
          ]}
        >
          <Animated.View
            style={[
              styles.progressBar,
              {
                backgroundColor: colors.saffron || '#D97706',
                transform: [{ translateX: shimmerTranslate }],
              },
            ]}
          />
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 99999,
    justifyContent: 'center',
    alignItems: 'center',
  },
  centerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    width: Math.min(SCREEN_WIDTH - 40, 320),
  },
  rippleRing: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    borderWidth: 1.5,
    top: -20,
  },
  orbitContainer: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    top: -15,
  },
  spiceDot: {
    position: 'absolute',
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 3,
  },
  steamContainer: {
    position: 'absolute',
    top: -25,
    height: 35,
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
  },
  steamDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  potCard: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.22,
    shadowRadius: 18,
    elevation: 8,
    marginBottom: 22,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  brandName: {
    fontSize: 22,
    letterSpacing: -0.4,
    marginBottom: 6,
  },
  quoteText: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    minHeight: 22,
  },
  subtext: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 4,
  },
  progressTrack: {
    width: 120,
    height: 3.5,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBar: {
    width: 55,
    height: '100%',
    borderRadius: 2,
  },
});
