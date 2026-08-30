import { useMemo } from 'react';
import { useWindowDimensions } from 'react-native';

import { GUTTER, GUTTER_SM, GUTTER_XS } from './tokens';

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
    /* 360 is the single most common Android width in this market, and 320 is
       the floor worth supporting. Both sit in the half of `sm` that a
       480px-shaped layout crowds. */
    const xs = width <= 360;

    return {
      width,
      height,
      sm,
      xs,

      /*
       * Two steps below the tablet break, not one.
       *
       * `sm` covers everything from a 320px Android to a 430px Pro Max, which
       * is a 34% difference in width treated as one size — so the phone that
       * needed the most help got exactly the layout designed for the phone
       * that needed the least. `xs` is the second step, and it is deliberately
       * narrow in what it changes.
       *
       * What shrinks: display type, gutters, the padding inside large
       * controls. Those are the things that crowd a small screen.
       *
       * What does not: body text, labels, and every tap target. Shrinking
       * those is the obvious move and the wrong one — 14px body copy at 320px
       * is not too big, it is the smallest it should ever be, and a button
       * that fits better by being harder to hit has not been improved.
       */
      gutter: xs ? GUTTER_XS : sm ? GUTTER_SM : GUTTER,

      /* clamp(30px, 8.5vw, 40px) -- fluid at every phone width */
      heroTitle: clamp(30, width * 0.085, 40),

      /* Fluid rather than stepped: a section title is the largest thing on
         most screens, so it is where a fixed size shows first. */
      sectionTitle: clamp(23, width * 0.072, 32),
      bentoImgTitle: xs ? 19 : sm ? 21 : 24,
      statNumber: xs ? 28 : sm ? 32 : 36,
      profileName: clamp(22, width * 0.068, 30),

      moodPillFont: sm ? 14 : 15,
      moodPillPadV: sm ? 11 : 12,
      moodPillPadH: xs ? 14 : sm ? 18 : 20,

      /* Vertical padding is the tap target and stays put; horizontal is
         breathing room and can give. */
      btnPadV: sm ? 14 : 15,
      btnPadH: xs ? 16 : sm ? 22 : 28,
      btnFont: 14,
      btnTracking: sm ? 0.5 : 14 * 0.09,

      brandWord: xs ? 17 : sm ? 18 : 20,
      brandGap: xs ? 5 : sm ? 6 : 8,

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
