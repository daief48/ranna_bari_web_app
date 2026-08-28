/**
 * Everything the chip row cannot say.
 *
 * A chip row is one question -- what kind of food -- asked once. It cannot
 * express "vegetarian, under ৳400, open right now, cheapest first", which is
 * an ordinary way to want dinner. Those are constraints rather than moods:
 * they hold while you browse across categories, so they live here and persist
 * until cleared, and the button that opens this sheet carries how many are on
 * so no filter is ever silently narrowing the list.
 */
import React from 'react';
import { Modal, Pressable, ScrollView, Text, View } from 'react-native';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

/** Nothing on: the state the "Clear all" button returns to. */
export const DEFAULT_FILTERS = {
  sort: 'nearest',
  openOnly: false,
  price: 'any',
  diet: [],
  minRating: 0,
};

export const SORTS = [
  { key: 'nearest', label: 'Nearest first', icon: 'navigation' },
  { key: 'rating', label: 'Top rated', icon: 'star' },
  { key: 'priceAsc', label: 'Cheapest first', icon: 'banknote' },
  { key: 'priceDesc', label: 'Most expensive', icon: 'gem' },
];

/**
 * Bands rather than a two-handled slider.
 *
 * Dragging two handles accurately on a phone is a fiddly way to answer a
 * question people already hold as a round number, and the bands sit either
 * side of the ৳340 the menu actually costs.
 */
export const PRICE_BANDS = [
  { key: 'any', label: 'Any price', min: 0, max: Infinity },
  { key: 'under200', label: 'Under ৳200', min: 0, max: 200 },
  { key: '200-400', label: '৳200 – ৳400', min: 200, max: 400 },
  { key: '400-800', label: '৳400 – ৳800', min: 400, max: 800 },
  { key: 'over800', label: '৳800+', min: 800, max: Infinity },
];

/** Real tags, not invented ones -- each of these is on dishes in the data. */
export const DIETS = [
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'diabetic', label: 'Diabetic-friendly' },
];

export const RATINGS = [
  { key: 0, label: 'Any rating' },
  { key: 4, label: '4.0+' },
  { key: 4.5, label: '4.5+' },
  { key: 4.8, label: '4.8+' },
];

export const priceBand = (key) =>
  PRICE_BANDS.find((b) => b.key === key) ?? PRICE_BANDS[0];

/**
 * How many constraints are narrowing the list.
 *
 * Sort is deliberately not counted: reordering hides nothing, and a badge
 * that reads "1" on a screen showing everything trains people to ignore it.
 */
export function activeCount(f) {
  return (
    (f.openOnly ? 1 : 0) +
    (f.price !== 'any' ? 1 : 0) +
    f.diet.length +
    (f.minRating > 0 ? 1 : 0)
  );
}

export default function FilterSheet({
  open,
  value,
  onChange,
  onClose,
  resultCount,
  canSortByDistance,
}) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  const set = (patch) => onChange({ ...value, ...patch });

  const toggleDiet = (key) =>
    set({
      diet: value.diet.includes(key)
        ? value.diet.filter((d) => d !== key)
        : [...value.diet, key],
    });

  const count = activeCount(value);

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          justifyContent: 'flex-end',
          backgroundColor: 'rgba(20, 16, 14, 0.45)',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={[
            {
              margin: 12,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: 'hidden',
            },
            shadow.lg,
          ]}
        >
          {/* ---- header ---- */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingHorizontal: 16,
              paddingVertical: 14,
              borderBottomWidth: 1,
              borderBottomColor: colors.line2,
            }}
          >
            <Text
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: 11,
                letterSpacing: 11 * tracking.label,
                textTransform: 'uppercase',
                color: colors.textMuted,
              }}
            >
              {t('Filters')}
            </Text>

            {/* Only offered once there is something to clear. */}
            {count > 0 ? (
              <Pressable
                onPress={() => onChange({ ...DEFAULT_FILTERS, sort: value.sort })}
                hitSlop={8}
                accessibilityRole="button"
              >
                <Text
                  style={{
                    fontFamily: font.uiBold,
                    fontSize: type.xs + 1,
                    letterSpacing: (type.xs + 1) * tracking.label,
                    textTransform: 'uppercase',
                    color: colors.primary,
                  }}
                >
                  {t('Clear all')}
                </Text>
              </Pressable>
            ) : null}

            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel={t('Close')}>
              <Icon name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* A fixed height so the sheet does not jump as sections change. */}
          <ScrollView style={{ height: 420 }} contentContainerStyle={{ padding: 16, gap: 22 }}>
            {/* ---- sort ---- */}
            <Group label={t('Sort by')}>
              {SORTS.map((s) => {
                // Distance needs an address to measure from; without one the
                // option would silently do nothing.
                const disabled = s.key === 'nearest' && !canSortByDistance;
                return (
                  <Choice
                    key={s.key}
                    icon={s.icon}
                    label={t(s.label)}
                    active={value.sort === s.key}
                    disabled={disabled}
                    onPress={() => set({ sort: s.key })}
                  />
                );
              })}
            </Group>

            {!canSortByDistance ? (
              <Note text={t('Add a delivery address to sort and filter by distance.')} />
            ) : null}

            {/* ---- open now ---- */}
            <Group label={t('Availability')}>
              <Choice
                icon="clock"
                label={t('Open now')}
                active={value.openOnly}
                onPress={() => set({ openOnly: !value.openOnly })}
              />
            </Group>

            {/* ---- price ---- */}
            <Group label={t('Price per dish')}>
              {PRICE_BANDS.map((b) => (
                <Choice
                  key={b.key}
                  label={t(b.label)}
                  active={value.price === b.key}
                  onPress={() => set({ price: b.key })}
                />
              ))}
            </Group>

            {/* ---- diet ---- */}
            <Group label={t('Dietary')}>
              {DIETS.map((d) => (
                <Choice
                  key={d.key}
                  icon="leaf"
                  label={t(d.label)}
                  active={value.diet.includes(d.key)}
                  onPress={() => toggleDiet(d.key)}
                />
              ))}
            </Group>

            {/* ---- rating ---- */}
            <Group label={t('Kitchen rating')}>
              {RATINGS.map((rt) => (
                <Choice
                  key={String(rt.key)}
                  icon={rt.key ? 'star' : null}
                  label={rt.key ? n(rt.label) : t(rt.label)}
                  active={value.minRating === rt.key}
                  onPress={() => set({ minRating: rt.key })}
                />
              ))}
            </Group>
          </ScrollView>

          {/* ---- footer ----
              The count is the point: it turns the sheet from a form you have
              to submit blind into one that answers "did that help?" before
              you close it. */}
          <View
            style={{
              padding: 12,
              borderTopWidth: 1,
              borderTopColor: colors.line2,
            }}
          >
            <Pressable
              onPress={onClose}
              accessibilityRole="button"
              style={({ pressed }) => [
                {
                  height: 52,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: radius.pill,
                  backgroundColor: colors.primary,
                  transform: [{ scale: pressed ? 0.98 : 1 }],
                },
                shadow.primary,
              ]}
            >
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: type.sm + 1,
                  letterSpacing: (type.sm + 1) * tracking.label,
                  textTransform: 'uppercase',
                  color: '#FFFFFF',
                }}
              >
                {resultCount
                  ? t(resultCount === 1 ? 'Show {n} result' : 'Show {n} results', {
                      n: n(resultCount),
                    })
                  : t('No matches')}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/** A titled block of choices. */
function Group({ label, children }) {
  const { colors } = useTheme();
  return (
    <View style={{ gap: 10 }}>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.xs + 1,
          letterSpacing: (type.xs + 1) * tracking.label,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>{children}</View>
    </View>
  );
}

/** One pill. Selected or not; multi-select groups just allow several. */
function Choice({ icon, label, active, disabled, onPress }) {
  const { colors, shadow } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      // See the chip row: `selected` does not reach the DOM, `pressed` does.
      aria-pressed={!!active}
      accessibilityState={{ selected: !!active, disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: radius.pill,
          backgroundColor: active ? colors.primary : colors.surfaceSolid,
          borderWidth: 1,
          borderColor: active ? colors.primary : colors.line,
          opacity: disabled ? 0.45 : 1,
          transform: [{ scale: pressed && !disabled ? 0.97 : 1 }],
        },
        active ? shadow.primary : shadow.xs,
      ]}
    >
      {icon ? (
        <Icon name={icon} size={13} color={active ? '#FFFFFF' : colors.textMuted} />
      ) : null}
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: 13,
          color: active ? '#FFFFFF' : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

/** A quiet line explaining why an option above is unavailable. */
function Note({ text }) {
  const { colors } = useTheme();
  return (
    <Text
      style={{
        fontFamily: font.ui,
        fontSize: type.xs + 1,
        lineHeight: (type.xs + 1) * 1.5,
        color: colors.textMuted,
        marginTop: -14,
      }}
    >
      {text}
    </Text>
  );
}
