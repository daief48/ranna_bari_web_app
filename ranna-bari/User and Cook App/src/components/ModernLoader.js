import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';

import { useTheme } from '../theme/ThemeProvider';
import { font, radius } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

const LOGO_LIGHT = require('../../assets/logo.png');
const LOGO_DARK = require('../../assets/logo-dark.png');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const BENGALI_QUOTES = [
  'আপনার এলাকার সেরা হোম শেফদের সংযুক্ত করা হচ্ছে…',
  'ঘরের তৈরি তাজা ও স্বাস্থ্যকর খাবারের মেনু সাজানো হচ্ছে…',
  'খাঁটি উপকরণ আর পরম ভালোবাসায় তৈরি খাবারের স্বাদ…',
  'রান্নাবাড়ির ঐতিহ্যবাহী স্বাদে আপনাকে স্বাগতম…',
];

const ENGLISH_QUOTES = [
  'Connecting authentic home chefs in your neighbourhood…',
  'Curating fresh homemade daily menus for you…',
  'Crafted with authentic ingredients, care & love…',
  'Welcome to the warmth of authentic home-cooked meals…',
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
  const { lang, brand } = useLang();

  // Animation values
  const fadeAnim = useRef(new Animated.Value(visible ? 1 : 0)).current;
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
    }, 2400);
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

  const solidBg = isDark ? '#121613' : '#FAF7F0';

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[
        styles.overlay,
        {
          backgroundColor: solidBg,
          opacity: fadeAnim,
        },
      ]}
    >
      {/* Solid Rich Ambient Radial Gradient */}
      <LinearGradient
        colors={[
          isDark ? '#1C241E' : '#FFFDF9',
          isDark ? '#141A15' : '#FAF7F0',
          isDark ? '#0F1310' : '#F4EEE2',
        ]}
        locations={[0, 0.55, 1]}
        start={{ x: 0.5, y: 0.2 }}
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
          <View style={[styles.spiceDot, { bottom: 0, left: '50%', backgroundColor: colors.primary || '#C7381A' }]} />
          <View style={[styles.spiceDot, { left: 0, top: '50%', backgroundColor: colors.sage || '#059669', width: 6, height: 6 }]} />
          <View style={[styles.spiceDot, { right: 0, top: '50%', backgroundColor: '#F59E0B', width: 5, height: 5 }]} />
        </Animated.View>

        {/* Floating Steam Particles */}
        <View style={styles.steamContainer}>
          <SteamParticle delay={0} xOffset={-10} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.7)' : 'rgba(217,119,6,0.6)' }} />
          <SteamParticle delay={450} xOffset={0} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.85)' : 'rgba(199,56,26,0.7)' }} />
          <SteamParticle delay={900} xOffset={12} style={{ backgroundColor: isDark ? 'rgba(255,255,255,0.65)' : 'rgba(245,158,11,0.6)' }} />
        </View>

        {/* Central Glowing Culinary Logo Card */}
        <Animated.View
          style={[
            styles.potCard,
            {
              backgroundColor: isDark ? '#1E2620' : '#FFFFFF',
              borderColor: isDark ? 'rgba(217, 119, 6, 0.45)' : 'rgba(199, 56, 26, 0.2)',
              transform: [{ translateY: potBounce }],
            },
          ]}
        >
          <Image
            source={isDark ? LOGO_DARK : LOGO_LIGHT}
            style={{
              width: 66,
              height: 66,
              borderRadius: 18,
            }}
            resizeMode="contain"
          />
        </Animated.View>

        {/* Brand Title Lockup & Meaningful Text */}
        <View style={styles.textContainer}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
            {/* One word in Bengali, two in Latin — see `Brand.js`. Splitting
                রান্নাবাড়ি by colour cuts its মাত্রা in half. */}
            {lang === 'bn' ? (
              <Text
                style={[
                  styles.brandName,
                  {
                    color: isDark ? colors.primary : colors.primary700 || '#7F1F0A',
                    fontFamily: font.displayExtra || 'NotoSansBengali_800ExtraBold',
                  },
                ]}
              >
                {brand.first}
                {brand.second}
              </Text>
            ) : (
              <>
                <Text
                  style={[
                    styles.brandName,
                    {
                      color: colors.text || (isDark ? '#FFFFFF' : '#1F1D1A'),
                      fontFamily: font.displayBold || 'Fraunces_700Bold',
                    },
                  ]}
                >
                  {brand.first}
                </Text>
                <Text
                  style={[
                    styles.brandName,
                    {
                      color: colors.primary || '#C7381A',
                      fontFamily: font.displayBold || 'Fraunces_700Bold',
                    },
                  ]}
                >
                  {brand.second}
                </Text>
              </>
            )}
          </View>

          {/* Meaningful Sub-header Tagline */}
          <Text
            style={[
              styles.tagline,
              {
                color: isDark ? '#A1A89F' : '#6B685F',
                fontFamily: font.uiMedium || 'Inter_500Medium',
              },
            ]}
          >
            {lang === 'bn'
              ? 'খাঁটি ঘরের স্বাদ • পরম যত্নে তৈরি'
              : 'Authentic Homemade Taste • Crafted with Love'}
          </Text>

          {/* Dynamic Status / Meaningful Quote */}
          <View
            style={[
              styles.quoteBadge,
              {
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(199, 56, 26, 0.05)',
                borderColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(199, 56, 26, 0.1)',
              },
            ]}
          >
            <Text
              key={quoteText}
              style={[
                styles.quoteText,
                {
                  color: colors.ink || (isDark ? '#E5E7EB' : '#2D2821'),
                  fontFamily: font.uiSemi || 'Inter_600SemiBold',
                },
              ]}
            >
              {quoteText}
            </Text>
          </View>

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
              backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
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
    marginBottom: 20,
  },
  textContainer: {
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 20,
  },
  brandName: {
    fontSize: 24,
    letterSpacing: -0.4,
  },
  tagline: {
    fontSize: 12.5,
    textAlign: 'center',
    letterSpacing: 0.2,
    marginBottom: 14,
  },
  quoteBadge: {
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 290,
  },
  quoteText: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18.5,
  },
  subtext: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 6,
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

