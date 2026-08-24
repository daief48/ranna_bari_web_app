/**
 * Design tokens ported 1:1 from `html css design/style.css`.
 *
 * The web stylesheet resolves every translucent tint through channel tokens
 * (--rgb-primary etc.) so a theme swap moves the whole surface treatment at
 * once. React Native has no cascade, so the same idea is expressed as two
 * frozen palette objects plus an `rgba()` helper that takes the channel
 * triple, keeping the exact alpha values from the CSS.
 */

export const rgba = (channel, alpha) => `rgba(${channel}, ${alpha})`;

/* 朱色 Shu-iro vermilion / 松葉色 wasabi / 山吹色 tamago, over washi paper */
const light = {
  name: 'light',

  /* channel triples — the rgba() sources */
  rgbPrimary: '199, 56, 26',
  rgbInk: '31, 29, 26',
  rgbSage: '85, 112, 63',
  rgbSaffron: '184, 133, 15',
  rgbRaised: '255, 255, 255',

  primary50: '#FCEFEA',
  primary100: '#F7D8CE',
  primary200: '#EAAB97',
  primary300: '#DB7A5F',
  primary: '#C7381A',
  primary600: '#A62B10',
  primary700: '#7F1F0A',

  sage: '#55703F',
  sage50: '#EFF3EA',
  sage100: '#DCE5D2',

  saffron: '#B8850F',
  saffron50: '#FCF4E0',
  saffron100: '#F6E5B9',

  ink: '#1F1D1A',
  ink2: '#5B564E',
  ink3: '#928B7F',

  canvas: '#FAF7F0',
  raised: '#FFFFFF',
  sunken: '#F5F0E5',
  line: 'rgba(31, 29, 26, 0.10)',
  line2: 'rgba(31, 29, 26, 0.06)',

  /* Device-location blue, deliberately outside the brand ramp */
  geo: '#2F7DF6',

  /* Theme-invariant: scrims sit on photographs and stay dark in both themes */
  scrim: '20, 16, 14',
  onDark: '#FFF6F1',

  /* White clears AA on light-mode vermilion (5.2:1) */
  onPrimary: '#FFFFFF',

  surfaceSolid: '#FFFFFF',
  surfaceHover: '#FFFFFF',

  /* expo-blur tint */
  blurTint: 'light',
  statusBar: 'dark',
};

/* 海苔 Nori over 墨 Sumi — a green-black, never a neutral one */
const dark = {
  name: 'dark',

  rgbPrimary: '239, 106, 61',
  rgbInk: '236, 234, 225',
  rgbSage: '143, 174, 114',
  rgbSaffron: '232, 190, 90',
  rgbRaised: '26, 33, 28',

  primary50: 'rgba(239, 106, 61, 0.14)',
  primary100: 'rgba(239, 106, 61, 0.22)',
  primary200: '#C7522C',
  primary300: '#D95E33',
  primary: '#EF6A3D',
  primary600: '#FF875F',
  primary700: '#7F1F0A',

  sage: '#8FAE72',
  sage50: 'rgba(143, 174, 114, 0.15)',
  sage100: 'rgba(143, 174, 114, 0.24)',

  saffron: '#E8BE5A',
  saffron50: 'rgba(232, 190, 90, 0.15)',
  saffron100: 'rgba(232, 190, 90, 0.24)',

  /* 白練 Shironeri — washi white, warmed so it is not clinical */
  ink: '#ECEAE1',
  ink2: '#A5ACA2',
  ink3: '#6C756E',

  canvas: '#101613',
  raised: '#1A211C',
  sunken: '#0B0F0D',
  line: 'rgba(236, 234, 225, 0.11)',
  line2: 'rgba(236, 234, 225, 0.06)',

  geo: '#2F7DF6',

  scrim: '20, 16, 14',
  onDark: '#FFF6F1',

  /* Dark-mode vermilion is bright enough that white drops to 3.1:1 and fails
     AA, so text on a primary fill flips to sumi (5.5:1). */
  onPrimary: '#221A15',

  surfaceSolid: '#1A211C',
  surfaceHover: '#232B25',

  blurTint: 'dark',
  statusBar: 'light',
};

/** Semantic aliases layered on top of a raw palette. */
const withSemantics = (p) => ({
  ...p,
  bg: p.canvas,
  bgAlt: p.sunken,
  text: p.ink,
  textMuted: p.ink2,
  textLight: p.ink3,
  secondary: p.sage,
  accent: p.saffron,
  primaryHover: p.primary600,
});

export const palettes = {
  light: withSemantics(light),
  dark: withSemantics(dark),
};

/* ---------------- shared, theme-invariant scales ---------------- */

export const radius = {
  xs: 8,
  sm: 14,
  md: 22,
  lg: 30,
  xl: 38,
  pill: 9999,
};

/** Phone gutter — the CSS `--page-gutter` at the 768 / 480 breakpoints. */
export const GUTTER = 16;
export const GUTTER_SM = 14;

export const font = {
  display: 'Fraunces_700Bold',
  displayRegular: 'Fraunces_400Regular',
  displaySemi: 'Fraunces_600SemiBold',
  displayBold: 'Fraunces_700Bold',
  displayExtra: 'Fraunces_800ExtraBold',
  displayBlack: 'Fraunces_900Black',
  displayItalic: 'Fraunces_800ExtraBold_Italic',

  ui: 'Inter_400Regular',
  uiMedium: 'Inter_500Medium',
  uiSemi: 'Inter_600SemiBold',
  uiBold: 'Inter_700Bold',
  uiLight: 'Inter_300Light',

  bengali: 'NotoSansBengali_500Medium',
  bengaliBold: 'NotoSansBengali_700Bold',
};

/** `--tracking-label: 0.09em` at the sizes it is actually used. */
export const tracking = {
  label: 0.09,
  tight: -0.012,
};

/**
 * Warm-tinted, multi-layer depth. Flat black shadows read as cheap, so the
 * CSS tints every shadow with the ink channel; iOS gets that tint directly
 * and Android gets the nearest elevation step.
 */
export const makeShadows = (p) => {
  const isDark = p.name === 'dark';
  const c = isDark ? '#000000' : `rgb(${p.rgbInk})`;
  const boost = isDark ? 2.2 : 1;
  return {
    xs: {
      shadowColor: c,
      shadowOpacity: 0.05 * boost,
      shadowRadius: 2,
      shadowOffset: { width: 0, height: 1 },
      elevation: 1,
    },
    sm: {
      shadowColor: c,
      shadowOpacity: 0.07 * boost,
      shadowRadius: 5,
      shadowOffset: { width: 0, height: 2 },
      elevation: 2,
    },
    md: {
      shadowColor: c,
      shadowOpacity: 0.13 * boost,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    lg: {
      shadowColor: c,
      shadowOpacity: 0.19 * boost,
      shadowRadius: 30,
      shadowOffset: { width: 0, height: 18 },
      elevation: 14,
    },
    primary: {
      shadowColor: `rgb(${p.rgbPrimary})`,
      shadowOpacity: 0.42,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    primaryLg: {
      shadowColor: `rgb(${p.rgbPrimary})`,
      shadowOpacity: 0.5,
      shadowRadius: 26,
      shadowOffset: { width: 0, height: 14 },
      elevation: 12,
    },
  };
};

/**
 * Phone type scale. The CSS uses fluid clamp() against viewport width; these
 * are the values those clamps resolve to on a 360–430px screen, which is the
 * only width this app ever renders at.
 */
export const type = {
  display: 40,     // clamp(30px, 8.5vw, 40px) at the phone breakpoint
  h1: 32,
  h2: 32,          // .section-title @768
  h2sm: 27,        // .section-title @480
  h3: 19,
  body: 16,
  sm: 14,
  xs: 12,
  micro: 10.5,
};
