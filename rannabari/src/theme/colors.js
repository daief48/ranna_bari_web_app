// Design tokens — mirrors the web CSS custom properties
// Every screen/component imports `useTheme()` and reads `colors`

export const lightColors = {
  // Core
  primary: '#E8652B',
  primaryLight: 'rgba(232, 101, 43, 0.12)',
  primaryDark: '#C7501F',
  onPrimary: '#FFFFFF',

  // Backgrounds
  bg: '#FAF9F7',
  bgElevated: '#FFFFFF',
  bgGlass: 'rgba(255,255,255,0.72)',
  surface: '#FFFFFF',
  surfaceHover: '#F5F4F2',

  // Text
  text: '#1A1A1A',
  textMuted: '#6B6B6B',
  textLight: '#999999',

  // Accents
  saffron: '#F2A900',
  sage: '#6B8F71',
  accent: '#E8652B',

  // Borders / Misc
  border: 'rgba(0,0,0,0.08)',
  borderStrong: 'rgba(0,0,0,0.15)',
  shadow: 'rgba(0,0,0,0.06)',
  card: '#FFFFFF',
  cardBorder: 'rgba(0,0,0,0.06)',
  overlay: 'rgba(0,0,0,0.4)',

  // Functional
  success: '#34C759',
  error: '#FF3B30',
  warning: '#FF9500',

  // Tab bar
  tabBar: 'rgba(255,255,255,0.92)',
  tabInactive: '#999999',
  tabActive: '#E8652B',

  // Status bar
  statusBar: 'dark',
};

export const darkColors = {
  // Core
  primary: '#F07A45',
  primaryLight: 'rgba(240, 122, 69, 0.15)',
  primaryDark: '#E8652B',
  onPrimary: '#FFFFFF',

  // Backgrounds
  bg: '#0F0F0F',
  bgElevated: '#1A1A1A',
  bgGlass: 'rgba(26,26,26,0.85)',
  surface: '#1E1E1E',
  surfaceHover: '#2A2A2A',

  // Text
  text: '#F0F0F0',
  textMuted: '#A0A0A0',
  textLight: '#666666',

  // Accents
  saffron: '#F2A900',
  sage: '#8AB592',
  accent: '#F07A45',

  // Borders / Misc
  border: 'rgba(255,255,255,0.08)',
  borderStrong: 'rgba(255,255,255,0.15)',
  shadow: 'rgba(0,0,0,0.3)',
  card: '#1E1E1E',
  cardBorder: 'rgba(255,255,255,0.06)',
  overlay: 'rgba(0,0,0,0.6)',

  // Functional
  success: '#30D158',
  error: '#FF453A',
  warning: '#FFD60A',

  // Tab bar
  tabBar: 'rgba(18,18,18,0.95)',
  tabInactive: '#666666',
  tabActive: '#F07A45',

  // Status bar
  statusBar: 'light',
};
