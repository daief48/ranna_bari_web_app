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

  /*
   * The floating navbar's glass, and the controls sitting on it.
   *
   * These are palette decisions, not component ones, because the bar carries
   * the logo — and the logo is a fixed warm vermilion-to-saffron in both
   * themes. Whatever it sits on has to belong to it.
   *
   * In light that was never in question: the canvas is a warm cream and the
   * mark's badge already carried a vermilion tint.
   */
  glass: 'rgba(255, 255, 255, 0.88)',
  glassLine: 'rgba(31, 29, 26, 0.08)',
  glassFill: 'rgba(31, 29, 26, 0.035)',
  glassEdge: 'rgba(31, 29, 26, 0.07)',
  glassMark: 'rgba(199, 56, 26, 0.06)',
  glassMarkEdge: 'rgba(199, 56, 26, 0.12)',

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

  /*
   * The navbar's glass — sumi, not nori.
   *
   * The rest of the dark theme is a green-black on purpose, and it stays
   * that way. The bar is the one surface where that reading breaks, because
   * it is the one surface carrying the logo: a warm vermilion-and-saffron
   * mark on a green-black ground shares no pigment with what it sits on, and
   * the two just sit there refusing each other.
   *
   * So the green comes out of this one plate and it settles to a warm sumi —
   * R over G over B, the same family as `onPrimary` and `scrim`, both of
   * which are already the warm dark this palette reaches for when something
   * warm has to sit on it. It stays near-black, so against the canvas behind
   * it this reads as the glass being warmer, not as a second black.
   *
   * The mark's badge then goes further and takes an actual vermilion tint,
   * mirroring what light mode always did. That is the part that makes the
   * logo look placed rather than pasted.
   */
  glass: 'rgba(31, 26, 22, 0.86)',
  glassLine: 'rgba(236, 234, 225, 0.13)',
  glassFill: 'rgba(236, 234, 225, 0.06)',
  glassEdge: 'rgba(236, 234, 225, 0.10)',
  glassMark: 'rgba(239, 106, 61, 0.16)',
  glassMarkEdge: 'rgba(239, 106, 61, 0.30)',

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
/** Narrower again below 360px, where 14 a side leaves a card looking boxed in. */
export const GUTTER_XS = 12;

/* ---------------- script-aware typography ---------------- */

/**
 * Neither Fraunces nor Inter draws a single Bengali glyph, so switching the
 * app to Bengali without switching the faces would hand every heading to
 * whatever the OS happens to fall back to -- a different voice on every
 * device, and tofu where there is no fallback at all.
 *
 * Rather than thread a font map through several hundred style objects, the
 * `font` and `tracking` exports below are getters over a script that the
 * language provider sets. Every call site already reads them during render
 * (nothing is captured in a module-level StyleSheet), so a language change
 * re-renders the tree and the new faces are picked up on the same pass.
 */
let activeScript = 'latin';

/** Called by the language provider. Not for screens. */
export function setTypeScript(script) {
  activeScript = script === 'bengali' ? 'bengali' : 'latin';
}

const LATIN = {
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
  /* Inter Light is not drawn anywhere, and its file is 335 KB — a third of a
     megabyte of APK for a weight nothing asks for. The token stays so callers
     keep working; it just resolves to the regular. */
  uiLight: 'Inter_400Regular',

  bengali: 'NotoSansBengali_500Medium',
  bengaliBold: 'NotoSansBengali_700Bold',
};

/**
 * Bengali has no italic tradition, so the one italic face maps to the
 * heaviest upright rather than to a synthesised slant.
 */
const BENGALI = {
  display: 'NotoSansBengali_700Bold',
  displayRegular: 'NotoSansBengali_400Regular',
  displaySemi: 'NotoSansBengali_600SemiBold',
  displayBold: 'NotoSansBengali_700Bold',
  displayExtra: 'NotoSansBengali_800ExtraBold',
  displayBlack: 'NotoSansBengali_800ExtraBold',
  displayItalic: 'NotoSansBengali_800ExtraBold',

  ui: 'NotoSansBengali_400Regular',
  uiMedium: 'NotoSansBengali_500Medium',
  uiSemi: 'NotoSansBengali_600SemiBold',
  uiBold: 'NotoSansBengali_700Bold',
  uiLight: 'NotoSansBengali_400Regular',

  bengali: 'NotoSansBengali_500Medium',
  bengaliBold: 'NotoSansBengali_700Bold',
};

export const font = {};
for (const key of Object.keys(LATIN)) {
  Object.defineProperty(font, key, {
    enumerable: true,
    get: () => (activeScript === 'bengali' ? BENGALI[key] : LATIN[key]),
  });
}

/**
 * `--tracking-label: 0.09em` at the sizes it is actually used.
 *
 * Both values fall to zero in Bengali. Letter-spacing pulls a Bengali word
 * apart at its conjunct clusters and detaches the matra -- the horizontal
 * bar that is supposed to run unbroken across the whole word -- so tracking
 * that reads as refinement in Latin reads as broken text here.
 */
export const tracking = {
  get label() {
    return activeScript === 'bengali' ? 0 : 0.09;
  },
  get tight() {
    return activeScript === 'bengali' ? 0 : -0.012;
  },
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

/* ---------------- width-aware type ---------------- */

/**
 * The screen this app is currently being drawn on.
 *
 * Set by the theme provider, the same way `activeScript` is set by the
 * language provider — and for the same reason. Roughly 350 style objects read
 * `type.*` during render, and threading a width through all of them is not a
 * refactor anybody should attempt; a module-level value behind getters is
 * picked up on the next render, which a dimensions change already causes.
 */
let deviceWidth = 390;

/** Called by the theme provider. Not for screens. */
export function setTypeWidth(width) {
  if (typeof width === 'number' && width > 0) deviceWidth = width;
}

/**
 * How much bigger type gets on a bigger phone.
 *
 * Deliberately one-directional: **1.0 is the floor.** The sizes below were
 * chosen for a 360–430px screen and they are already right at the small end,
 * so a 320px phone renders exactly what it always did. Shrinking them to make
 * a layout fit would trade a spacing problem for a legibility one, and 10.5px
 * label text has no room left to give.
 *
 * Upwards is where the gap was. A 430px Pro Max was rendering the same 14px
 * as a 320px handset — 34% more screen and identical type, which is most of
 * why a large phone felt like a small one stretched. 6% is the most that
 * reads as "sized for this screen" rather than as a different design.
 */
const scale = () => Math.min(1.06, Math.max(1, deviceWidth / 390));

/** Rounded to a tenth: React Native takes fractional sizes, and 15.1 is a
    real size, but 15.083333 in a diff helps nobody. */
const fluid = (size) => Math.round(size * scale() * 10) / 10;

/**
 * Phone type scale. The CSS uses fluid clamp() against viewport width; these
 * are the values those clamps resolve to on a 390px screen, and every one of
 * them now grows with the screen rather than staying put across the whole
 * phone range.
 *
 * Getters, not values — see `deviceWidth` above.
 */
export const type = {
  get display() {
    return fluid(40);
  },
  get h1() {
    return fluid(32);
  },
  get h2() {
    return fluid(32);
  },
  get h2sm() {
    return fluid(27);
  },
  get h3() {
    return fluid(19);
  },
  get body() {
    return fluid(16);
  },
  get sm() {
    return fluid(14);
  },
  get xs() {
    return fluid(12);
  },
  get micro() {
    /* Half the growth. This is the smallest text in the app and it is used
       for uppercase labels with wide tracking, where a size bump costs more
       horizontal room than it buys legibility. */
    return Math.round(10.5 * (1 + (scale() - 1) / 2) * 10) / 10;
  },
};
