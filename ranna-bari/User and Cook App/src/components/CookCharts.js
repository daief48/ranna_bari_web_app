/**
 * The cook panel's chart kit — donut, week bars, sparkline, progress rail.
 *
 * Drawn on `react-native-svg` (already in the bundle) and animated with
 * reanimated, because a chart that pops in fully drawn reads as a picture of
 * data rather than data. Every chart here takes plain numbers and does its
 * own arithmetic — screens hand over buckets, never percentages.
 *
 * All growth animations run once, on mount: a chart is an answer, not a
 * screensaver. Nothing loops.
 */
import React, { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Defs, G, Path, Polyline, Stop, LinearGradient } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';

import { useTheme } from '../theme/ThemeProvider';
import { font } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

/* ------------------------------------------------------------------ *
 * count-up
 * ------------------------------------------------------------------ */

/**
 * A headline number that counts up to its value once, on mount.
 *
 * Format comes from the caller — `format={(x) => \`৳${n(x)}\`}` — because
 * the digits must obey the screen's language, not the chart's guess. It
 * runs once; a number that re-counts on every data tick is a toy, and
 * this screen is a readout.
 */
export function CountUp({ value, format, duration = 900, delay = 0, style }) {
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    let frame = 0;
    let start = 0;
    const target = Number(value) || 0;
    const timer = setTimeout(() => {
      const step = (now) => {
        if (!start) start = now;
        const t = Math.min(1, (now - start) / duration);
        /* ease-out cubic — fast first, settling last, like everything
           else in this kit. */
        const eased = 1 - Math.pow(1 - t, 3);
        setDisplay(Math.round(target * eased));
        if (t < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, delay);

    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
    };
  }, [value, duration, delay]);

  return <Text style={style}>{format(display)}</Text>;
}

/* ------------------------------------------------------------------ *
 * area trend — a gradient curve, for the week's headline
 * ------------------------------------------------------------------ */

/**
 * A smooth gradient area under the week's revenue — the one chart that
 * leads a card instead of illustrating it.
 *
 * Drawn white-on-gradient by its caller (the hero card), fading in once.
 * The shape is the message: a rising curve needs no axis to be read as
 * "up", which is exactly why it leads rather than supports.
 */
export function AreaTrend({ values, width = 280, height = 64, color = '#FFFFFF', delay = 0 }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(
      delay,
      withTiming(1, { duration: 700, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, opacity]);

  const anim = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const list = values.length ? values : [0];
  const max = Math.max(...list, 1);
  const pad = 6;
  const step = list.length > 1 ? (width - pad * 2) / (list.length - 1) : 0;
  const pts = list.map((v, i) => [
    pad + i * step,
    height - 4 - (v / max) * (height - 14),
  ]);
  const line = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const area = `M ${pts[0][0]},${height} L ${line.split(' ').join(' L ')} L ${pts[pts.length - 1][0]},${height} Z`;
  const last = pts[pts.length - 1];

  /* The gradient needs a stable id per instance, not per render. */
  const gradId = useState(() => `at-${Math.random().toString(36).slice(2, 8)}`)[0];

  return (
    <Animated.View style={[anim, { width, height }]}>
      <Svg width={width} height={height}>
        <Defs>
          <LinearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={color} stopOpacity={0.35} />
            <Stop offset="1" stopColor={color} stopOpacity={0.02} />
          </LinearGradient>
        </Defs>
        <Path d={area} fill={`url(#${gradId})`} />
        <Polyline
          points={line}
          fill="none"
          stroke={color}
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <Circle cx={last[0]} cy={last[1]} r={3.5} fill={color} />
      </Svg>
    </Animated.View>
  );
}

/* ------------------------------------------------------------------ *
 * gauge — a ring for "how far through"
 * ------------------------------------------------------------------ */

/**
 * A circular progress ring — today's plates handed over, at a glance.
 *
 * The rail below it in the meal panel says the same thing in a line; the
 * ring earns its place by being legible from across the room, which is
 * the reading a cook mid-service actually does. Centre carries the raw
 * count, the arc carries the share.
 */
export function Gauge({
  value,
  total,
  size = 84,
  thickness = 10,
  color,
  label,
  delay = 0,
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, progress]);

  const radius = (size - thickness) / 2;
  const C = 2 * Math.PI * radius;
  const frac = total ? Math.min(1, Math.max(0, value / total)) : 0;

  const animatedProps = useAnimatedProps(() => ({
    strokeDasharray: `${frac * progress.value * C} ${C}`,
  }));

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.sunken}
          strokeWidth={thickness}
          fill="none"
        />
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            stroke={color ?? colors.sage}
            strokeWidth={thickness}
            fill="none"
            strokeLinecap="round"
            strokeDasharray="0 999"
            animatedProps={animatedProps}
          />
        </G>
      </Svg>
      <View style={{ alignItems: 'center' }}>
        <Text
          style={{
            fontFamily: font.displayExtra,
            fontSize: 15,
            letterSpacing: -0.3,
            color: colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {nOf(value)}/{nOf(total)}
        </Text>
        {label ? (
          <Text
            maxFontSizeMultiplier={1.2}
            style={{
              fontFamily: font.uiSemi,
              fontSize: 7.5,
              letterSpacing: 0.5,
              textTransform: 'uppercase',
              color: colors.textMuted,
            }}
          >
            {label}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * stacked week bars — each day cut into its businesses
 * ------------------------------------------------------------------ */

/**
 * Seven columns, each bar stacked into its parts — the week's revenue with
 * the mix living inside the bars instead of beside them.
 *
 * A tall day asks "why"; a stacked bar answers in place (a green body with
 * a saffron cap reads as kitchen-with-a-little-shop). Zero days keep their
 * stub. The legend is the caller's — it already has one from the donut.
 */
export function StackedWeekBars({ days, height = 96 }) {
  const { colors } = useTheme();
  const peak = Math.max(...days.map((d) => d.total), 1);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: height + 46 }}>
      {days.map((day, i) => {
        const columnHeight = day.total ? Math.max(12, (day.total / peak) * height) : 3;
        return (
          <View key={day.key} style={{ flex: 1, alignItems: 'center', gap: 7 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.uiSemi,
                fontSize: 9,
                color: day.total ? colors.text : 'transparent',
                fontVariant: ['tabular-nums'],
              }}
            >
              {day.label}
            </Text>
            <View style={{ width: '100%', height, justifyContent: 'flex-end' }}>
              {day.total ? (
                <View style={{ flexDirection: 'column-reverse', width: '100%' }}>
                  {day.segments.map((seg, j) => (
                    <GrowingBar
                      key={j}
                      height={Math.max(2, (seg.value / day.total) * columnHeight)}
                      color={seg.color}
                      delay={i * 55 + j * 70}
                    />
                  ))}
                </View>
              ) : (
                <GrowingBar height={3} color={colors.line} delay={i * 55} />
              )}
            </View>
            <Text
              style={{
                fontFamily: day.today ? font.uiBold : font.ui,
                fontSize: 10,
                color: day.today ? colors.sage : colors.textLight,
              }}
            >
              {day.day}
            </Text>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 9.5,
                color: day.count ? colors.textMuted : 'transparent',
                fontVariant: ['tabular-nums'],
              }}
            >
              {day.count}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * donut
 * ------------------------------------------------------------------ */

/**
 * A donut of segments — the week's order mix, say — sweeping in clockwise
 * from twelve o'clock.
 *
 * One shared clock drives every arc: each grows from the centre of the
 * chart outward in sequence, so the whole ring draws itself in under a
 * second instead of three arcs fading in as three unrelated facts. Segments
 * with a value of zero are simply absent — a legend row for "0" is a row
 * about nothing.
 */
export function DonutChart({
  segments,
  size = 132,
  thickness = 15,
  centerValue,
  centerLabel,
  delay = 0,
}) {
  const { colors } = useTheme();
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 850, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, progress]);

  const radius = (size - thickness) / 2;
  const C = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0);

  let acc = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total ? s.value / total : 0;
      const arc = { color: s.color, frac, start: acc };
      acc += frac;
      return arc;
    });

  return (
    <View style={{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* The track, so an empty chart still reads as a chart. */}
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={colors.sunken}
          strokeWidth={thickness}
          fill="none"
        />
        <G rotation={-90} originX={size / 2} originY={size / 2}>
          {arcs.map((arc, i) => (
            <DonutArc
              key={i}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              circumference={C}
              color={arc.color}
              frac={arc.frac}
              start={arc.start}
              thickness={thickness}
              progress={progress}
            />
          ))}
        </G>
      </Svg>

      {centerValue != null ? (
        <View style={{ alignItems: 'center' }}>
          <Text
            maxFontSizeMultiplier={1.2}
            style={{
              fontFamily: font.displayExtra,
              fontSize: 22,
              letterSpacing: -0.5,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            {centerValue}
          </Text>
          {centerLabel ? (
            <Text
              maxFontSizeMultiplier={1.2}
              style={{
                fontFamily: font.uiSemi,
                fontSize: 8.5,
                letterSpacing: 0.7,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {centerLabel}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/** One ring segment. Owns its animated props — hooks are not allowed in a loop. */
function DonutArc({ cx, cy, r, circumference: C, color, frac, start, thickness, progress }) {
  const animatedProps = useAnimatedProps(() => ({
    /* Both the visible length and the start offset scale with one progress,
       so segments sweep in their real order rather than appearing in place. */
    strokeDasharray: `${frac * progress.value * C} ${C}`,
    strokeDashoffset: -start * progress.value * C,
  }));

  return (
    <AnimatedCircle
      cx={cx}
      cy={cy}
      r={r}
      stroke={color}
      strokeWidth={thickness}
      fill="none"
      strokeDasharray="0 999"
      animatedProps={animatedProps}
    />
  );
}

/* ------------------------------------------------------------------ *
 * week bars
 * ------------------------------------------------------------------ */

/**
 * Seven columns, oldest first — revenue in the bar, orders under the day.
 *
 * Each bar grows from the baseline with a small stagger, which is what makes
 * a week read as a week rather than as seven separate numbers. Zero days get
 * a stub, not a gap: an axis of nothing looks broken, an axis with a flat
 * spot looks honest.
 */
export function WeekBars({ days, height = 92 }) {
  const { colors } = useTheme();
  const peak = Math.max(...days.map((d) => d.value), 1);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, height: height + 46 }}>
      {days.map((day, i) => {
        const barHeight = day.value ? Math.max(10, (day.value / peak) * height) : 3;
        return (
          <View key={day.key} style={{ flex: 1, alignItems: 'center', gap: 7 }}>
            <Text
              numberOfLines={1}
              style={{
                fontFamily: font.uiSemi,
                fontSize: 9,
                color: day.value ? colors.text : 'transparent',
                fontVariant: ['tabular-nums'],
              }}
            >
              {day.label}
            </Text>
            <View style={{ width: '100%', height, justifyContent: 'flex-end' }}>
              <GrowingBar
                height={barHeight}
                color={day.value ? (day.today ? colors.sage : colors.sage100) : colors.line}
                delay={i * 55}
              />
            </View>
            <Text
              style={{
                fontFamily: day.today ? font.uiBold : font.ui,
                fontSize: 10,
                color: day.today ? colors.sage : colors.textLight,
              }}
            >
              {day.day}
            </Text>
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 9.5,
                color: day.count ? colors.textMuted : 'transparent',
                fontVariant: ['tabular-nums'],
              }}
            >
              {day.count}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** A bar that grows once. Owns its shared value — one per bar, never a loop. */
function GrowingBar({ height, color, delay }) {
  const { colors } = useTheme();
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 550, easing: Easing.out(Easing.cubic) }));
  }, [delay, v]);

  const anim = useAnimatedStyle(() => ({
    height: Math.max(3, height * v.value),
    opacity: v.value,
  }));

  return (
    <Animated.View
      style={[{ width: '100%', borderRadius: 7, backgroundColor: colors.sunken }, anim, { backgroundColor: color }]}
    />
  );
}

/* ------------------------------------------------------------------ *
 * sparkline
 * ------------------------------------------------------------------ */

/**
 * Seven dots' worth of shape — the trend line inside a business card.
 *
 * Deliberately unlabelled: the card's numbers say what happened today, the
 * sparkline says whether this week was better or worse, and neither needs
 * the other's axes. A flat line is drawn, not hidden — "quiet week" is a
 * fact a cook can see at a glance.
 */
export function Sparkline({ values, width = 118, height = 30, color, strokeWidth = 2 }) {
  const list = values.length ? values : [0];
  const max = Math.max(...list, 1);

  const pts = list.map((v, i) => [
    list.length > 1 ? 3 + (i / (list.length - 1)) * (width - 6) : width / 2,
    height - 4 - (v / max) * (height - 9),
  ]);
  const flat = pts.map(([x, y]) => `${x},${y}`).join(' ');
  const last = pts[pts.length - 1];

  return (
    <Svg width={width} height={height}>
      <Polyline
        points={flat}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinejoin="round"
        strokeLinecap="round"
        opacity={0.9}
      />
      <Circle cx={last[0]} cy={last[1]} r={2.8} fill={color} />
    </Svg>
  );
}

/* ------------------------------------------------------------------ *
 * trend bars — the compact week, for panels that already have a headline
 * ------------------------------------------------------------------ */

/**
 * Seven slim bars with a letter under each — WeekBars stripped to its shape.
 *
 * The business-breakdown panels carry their own headline numbers, so this
 * variant drops the value labels and counts and keeps only the silhouette:
 * which day spiked, which sat flat. A zero day still draws its stub — an
 * absent day reads as missing data, a stub reads as quiet.
 */
export function TrendBars({ values, letters, color, height = 54, delay = 0 }) {
  const { colors } = useTheme();
  const peak = Math.max(...values, 1);

  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6 }}>
      {values.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{ width: '100%', height, justifyContent: 'flex-end' }}>
            <GrowingBar
              height={v ? Math.max(6, (v / peak) * height) : 3}
              color={v ? color : colors.line}
              delay={delay + i * 45}
            />
          </View>
          <Text
            style={{
              fontFamily: font.ui,
              fontSize: 8.5,
              color: colors.textLight,
            }}
          >
            {letters?.[i] ?? ''}
          </Text>
        </View>
      ))}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * bar list — horizontal bars for a ranked few
 * ------------------------------------------------------------------ */

/**
 * Ranked horizontal bars — top dishes and their share of the week.
 *
 * Vertical bars are for time; a ranking reads better lying down, with the
 * name on the left where the eye starts. Each row fills left-to-right
 * against the leader, staggered top to bottom, so the race is visible in
 * the shape and not only in the numbers.
 *
 * Rows are openable: `onPress` hands the row's `key` back, so a dish bar
 * can open the menu the dish lives on.
 */
export function BarList({ rows, height = 8, delay = 0 }) {
  const { colors } = useTheme();
  const peak = Math.max(...rows.map((r) => r.value), 1);

  return (
    <View style={{ gap: 12 }}>
      {rows.map((row, i) => (
        <BarRow key={row.key} row={row} peak={peak} height={height} delay={delay + i * 90} />
      ))}
    </View>
  );
}

function BarRow({ row, peak, height, delay }) {
  const { colors } = useTheme();
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.cubic) }));
  }, [delay, v]);

  const anim = useAnimatedStyle(() => ({ width: `${(row.value / peak) * 100 * v.value}%` }));

  return (
    <Pressable
      accessibilityRole={row.onPress ? 'link' : undefined}
      accessibilityLabel={`${row.label}: ${nOf(row.count)}`}
      onPress={row.onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.75 : 1 })}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 10,
          marginBottom: 5,
        }}
      >
        <Text
          numberOfLines={1}
          style={{
            flex: 1,
            fontFamily: font.uiSemi,
            fontSize: 13.5,
            color: colors.text,
          }}
        >
          {row.label}
        </Text>
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 13,
            color: colors.text,
            fontVariant: ['tabular-nums'],
          }}
        >
          {nOf(row.count)}
        </Text>
      </View>
      <View
        style={{
          height,
          borderRadius: 999,
          backgroundColor: colors.sunken,
          overflow: 'hidden',
        }}
      >
        <Animated.View
          style={[
            {
              height: '100%',
              borderRadius: 999,
              backgroundColor: row.color ?? colors.sage,
            },
            anim,
          ]}
        />
      </View>
    </Pressable>
  );
}

/* ------------------------------------------------------------------ *
 * segmented bar — a pipeline in one line
 * ------------------------------------------------------------------ */

/**
 * One bar, cut into labelled segments — today's orders by stage.
 *
 * A pipeline is a *share of a whole*, which is exactly what a stacked bar
 * shows and four number tiles hide: the bar's shape says at a glance
 * whether the day is done, stuck in the middle, or still mostly waiting.
 * Every segment grows in sequence; a zero stage is simply absent, and an
 * empty day draws the bare track rather than pretending.
 */
export function SegmentedBar({ segments, height = 12, delay = 0 }) {
  const { colors } = useTheme();
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) }),
    );
  }, [delay, progress]);

  let acc = 0;
  const cuts = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const frac = total ? s.value / total : 0;
      const cut = { ...s, frac, start: acc };
      acc += frac;
      return cut;
    });

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          flexDirection: 'row',
          height,
          borderRadius: 999,
          backgroundColor: colors.sunken,
          overflow: 'hidden',
        }}
      >
        {cuts.map((cut, i) => (
          <Segment key={i} frac={cut.frac} start={cut.start} color={cut.color} progress={progress} />
        ))}
      </View>

      {/* The legend doubles as the readout — each stage's count sits beside
          its colour, so the bar never has to be measured by eye. */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 14 }}>
        {segments.map((s) => (
          <View
            key={s.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              opacity: s.value ? 1 : 0.4,
            }}
          >
            <View
              style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: s.color }}
            />
            <Text
              style={{
                fontFamily: font.uiSemi,
                fontSize: 11,
                color: colors.textMuted,
              }}
            >
              {s.label}
            </Text>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 12,
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {nOf(s.value)}
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function Segment({ frac, start, color, progress }) {
  const anim = useAnimatedStyle(() => ({
    flex: frac * progress.value,
  }));

  return <Animated.View style={[{ height: '100%', backgroundColor: color }, anim]} />;
}

/* ------------------------------------------------------------------ *
 * mini week — a booking strip
 * ------------------------------------------------------------------ */

/**
 * Seven small day tiles with a count under each — the meal board's week.
 *
 * The same shape the meal hub draws, at card scale: today ringed, days
 * with plates tinted, the count in the platform's accent when there is
 * cooking to do and a quiet dot when there is not. A week of dots reads
 * as breathing room; a week of numbers reads as work — both are honest.
 */
export function MiniWeek({ days, todayKey: today }) {
  const { colors } = useTheme();

  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      {days.map((day) => {
        const on = day.date === today;
        return (
          <View
            key={day.date}
            style={{
              flex: 1,
              alignItems: 'center',
              paddingVertical: 7,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: on ? colors.sage : colors.line,
              backgroundColor: on ? colors.sage50 : colors.sunken,
            }}
          >
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 9.5,
                color: colors.textMuted,
              }}
            >
              {day.weekday}
            </Text>
            <Text
              style={{
                fontFamily: on ? font.uiBold : font.uiSemi,
                fontSize: 13,
                marginTop: 1,
                color: on ? colors.sage : colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              {day.day}
            </Text>
            <Text
              style={{
                fontFamily: font.uiBold,
                fontSize: 10,
                marginTop: 2,
                color: day.count ? colors.primary : colors.textLight,
                fontVariant: ['tabular-nums'],
              }}
            >
              {day.count ? nOf(day.count) : '·'}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ *
 * shared bits
 * ------------------------------------------------------------------ */

/* The Bengali-numeral helper, inlined: the charts render above the language
   provider's hooks in a few call sites, so the translation is passed in as
   `count` strings by the screen when it matters. Where a raw number is all
   a row has, this keeps digits legible without a context dependency. */
let numeralFn = null;
/** Called by the dashboard, which owns the language's `n()`. Not for screens. */
export const setChartNumerals = (fn) => {
  numeralFn = typeof fn === 'function' ? fn : null;
};
const nOf = (value) => (numeralFn ? numeralFn(value) : String(value));

/* ------------------------------------------------------------------ *
 * progress rail
 * ------------------------------------------------------------------ */

/**
 * A slim fill bar for "how far through" — today's handovers, say.
 *
 * Fills once on mount. Re-filling on every value change would turn a
 * readout into an animation; the dashboard's numbers change when the data
 * does, and the rail's job is to show where things stand.
 */
export function ProgressRail({ value, total, tone, height = 8 }) {
  const { colors } = useTheme();
  const pct = total ? Math.min(1, Math.max(0, value / total)) : 0;
  const v = useSharedValue(0);

  useEffect(() => {
    v.value = withTiming(pct, { duration: 700, easing: Easing.out(Easing.cubic) });
  }, [pct, v]);

  const anim = useAnimatedStyle(() => ({ width: `${v.value * 100}%` }));

  return (
    <View
      style={{
        height,
        borderRadius: 999,
        backgroundColor: colors.sunken,
        overflow: 'hidden',
      }}
    >
      <Animated.View
        style={[{ height: '100%', borderRadius: 999, backgroundColor: tone ?? colors.sage }, anim]}
      />
    </View>
  );
}
