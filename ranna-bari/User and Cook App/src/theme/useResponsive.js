import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { GUTTER, GUTTER_SM } from './tokens';

/**
 * The stylesheet has two phone breakpoints, not one, and most handsets land
 * under the smaller of them: at 390 CSS px a phone matches BOTH
 * `max-width: 768px` and `max-width: 480px`, so the 480 values are what
 * actually paint. This resolves each size the way the cascade would.
 *
 * The one exception is the hero title. Its 768 rule carries `!important`
 * (becomecook.html pins an inline clamp it has to beat), so the 480 rule
 * never lands and the fluid `clamp(30px, 8.5vw, 40px)` keeps applying all
 * the way down -- 33px on a 390px screen, not 30 and not 40.
 */
const clamp = (min, val, max) => Math.min(max, Math.max(min, val));

export default function useResponsive() {
  const { width, height } = useWindowDimensions();

  return useMemo(() => {
    const sm = width <= 480;

    return {
      width,
      height,
      sm,

      gutter: sm ? GUTTER_SM : GUTTER,

      /* clamp(30px, 8.5vw, 40px) -- fluid at every phone width */
      heroTitle: clamp(30, width * 0.085, 40),

      sectionTitle: sm ? 27 : 32,
      bentoImgTitle: sm ? 21 : 24,
      statNumber: sm ? 32 : 36,
      profileName: sm ? 26 : 30,

      moodPillFont: sm ? 14 : 15,
      moodPillPadV: sm ? 11 : 12,
      moodPillPadH: sm ? 18 : 20,

      btnPadV: sm ? 14 : 15,
      btnPadH: sm ? 22 : 28,
      btnFont: 14,
      btnTracking: sm ? 0.5 : 14 * 0.09,

      brandWord: sm ? 18 : 20,
      brandGap: sm ? 6 : 8,

      /* .tm-track grid-auto-columns */
      tmCard: sm ? width * 0.84 : clamp(272, width * 0.78, 384),
      tmText: sm ? 16 : 17,
      /* Dots would wrap to three rows at this width; the arrows carry it. */
      tmDots: !sm,

      /* Menu row: price and CTA get their own lines once it gets too tight */
      menuStackPrice: sm,
    };
  }, [width, height]);
}
