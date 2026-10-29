import React, { useMemo } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { SLOT_LABEL } from '../features/meal-plan/format';

/**
 * Each sitting's colour and mark — the same three the cook's monthly menu
 * uses, so a morning is the same saffron sun in both places.
 */
const LOOK = {
  breakfast: { icon: 'sun', tone: 'saffron' },
  lunch: { icon: 'utensils', tone: 'sage' },
  dinner: { icon: 'moon', tone: 'primary' },
};

/** Where a plate stands, in a cook's words. `tone` names a theme colour. */
const STATE = {
  confirmed: { label: 'Waiting', tone: 'textMuted' },
  preparing: { label: 'Cooking', tone: 'saffron' },
  delivered: { label: 'Delivered', tone: 'sage' },
  completed: { label: 'Confirmed', tone: 'sage' },
};

/** The one step a cook can take on a plate, and what the button says. */
const STEP = {
  confirmed: 'Start cooking',
  preparing: 'Mark delivered',
};

const isDone = (o) => o.status === 'delivered' || o.status === 'completed';

/**
 * One sitting of the day — every plate for breakfast, or lunch, or dinner.
 *
 * The board used to list plates one card each, every card with its own large
 * red button. A kitchen that serves forty plates of the same lunch had forty
 * cards and forty taps, and no place that said "lunch: twelve to go". A cook
 * does not cook plate by plate, they cook a *sitting*, so the sitting is the
 * unit here:
 *
 *   - a header that says which sitting, and how far through it is;
 *   - the plates under it grouped by dish, so "Pulao + roast ×12" is one line
 *     of cooking and twelve names to hand it to;
 *   - one button for the whole step ("Start cooking all · 12"), because the
 *     tap that starts the pot starts it for everyone.
 *
 * Each plate still has its own button — one customer's lunch may go out ahead
 * of the rest — and the screen above updates on the tap, not on the reply.
 *
 * @param {object} props
 * @param {'breakfast'|'lunch'|'dinner'} props.slot
 * @param {object[]} props.plates  This sitting's orders.
 * @param {(id: string) => void} props.onAdvance  Move one plate a step.
 * @param {(ids: string[]) => void} props.onAdvanceAll  Move several together.
 */
function MealSitting({ slot, plates, onAdvance, onAdvanceAll }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const look = LOOK[slot] ?? LOOK.lunch;
  const tint = colors[look.tone];
  const soft = colors[`${look.tone}50`];

  const done = plates.filter(isDone).length;
  const pending = plates.filter((o) => !isDone(o));

  /* The bulk action is the earliest step anybody in this sitting still needs:
     start the pot for whoever has not, and only then hand out the rest. */
  const waiting = pending.filter((o) => o.status === 'confirmed');
  const cooking = pending.filter((o) => o.status === 'preparing');
  const bulk =
    pending.length < 2
      ? null
      : waiting.length
        ? { ids: waiting.map((o) => o.id), label: t('Start cooking all · {n}', { n: n(waiting.length) }) }
        : cooking.length
          ? { ids: cooking.map((o) => o.id), label: t('Mark all delivered · {n}', { n: n(cooking.length) }) }
          : null;

  /* Plates of one dish together; the order of first appearance is kept. */
  const dishes = useMemo(() => {
    const byDish = new Map();
    for (const o of plates) {
      const key = o.title || '—';
      if (!byDish.has(key)) byDish.set(key, []);
      byDish.get(key).push(o);
    }
    return Array.from(byDish.entries());
  }, [plates]);

  const finished = pending.length === 0;

  return (
    <View
      style={[
        {
          borderRadius: 24,
          overflow: 'hidden',
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: finished ? colors.sage100 : colors.line,
        },
        shadow.sm,
      ]}
    >
      {/* ---- the sitting ---- */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          backgroundColor: soft,
        }}
      >
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 14,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.surfaceSolid,
          }}
        >
          <Icon name={finished ? 'check' : look.icon} size={19} color={finished ? colors.sage : tint} strokeWidth={finished ? 2.6 : 2} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{ fontFamily: font.displayBold, fontSize: 17, letterSpacing: -0.2, color: colors.text }}
          >
            {t(SLOT_LABEL[slot] ?? slot)}
          </Text>
          <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
            {finished
              ? t('All {n} handed over', { n: n(plates.length) })
              : t('{done} of {total} handed over', { done: n(done), total: n(plates.length) })}
          </Text>
        </View>
        <Text
          style={{
            fontFamily: font.displayExtra,
            fontSize: 24,
            letterSpacing: -0.5,
            color: finished ? colors.sage : tint,
            fontVariant: ['tabular-nums'],
          }}
        >
          {n(plates.length)}
        </Text>
      </View>

      {/* A sitting's own progress, edge to edge under its header. */}
      <View style={{ height: 3, backgroundColor: colors.line2 }}>
        <View
          style={{
            width: `${Math.round((done / Math.max(1, plates.length)) * 100)}%`,
            height: '100%',
            backgroundColor: colors.sage,
          }}
        />
      </View>

      {/* ---- the plates, by dish ---- */}
      <View style={{ padding: 14, gap: 14 }}>
        {dishes.map(([title, list]) => (
          <View key={title} style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text
                numberOfLines={2}
                style={{ flex: 1, fontFamily: font.uiBold, fontSize: type.sm + 2, color: colors.text }}
              >
                {title}
              </Text>
              {list.length > 1 ? (
                <View
                  style={{
                    paddingVertical: 2,
                    paddingHorizontal: 8,
                    borderRadius: radius.pill,
                    backgroundColor: soft,
                  }}
                >
                  <Text style={{ fontFamily: font.uiBold, fontSize: 11, color: tint }}>
                    ×{n(list.length)}
                  </Text>
                </View>
              ) : null}
            </View>

            {list.map((o) => {
              const state = STATE[o.status] ?? STATE.confirmed;
              const next = STEP[o.status];
              const where = [o.address?.line, o.address?.area].filter(Boolean).join(', ');
              return (
                <View
                  key={String(o.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 9,
                    paddingHorizontal: 11,
                    borderRadius: 16,
                    backgroundColor: colors.sunken,
                    opacity: isDone(o) ? 0.7 : 1,
                  }}
                >
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text
                      numberOfLines={1}
                      style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                    >
                      {o.customerName || o.customerKey}
                    </Text>
                    {where ? (
                      <Text
                        numberOfLines={1}
                        style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                      >
                        {where}
                      </Text>
                    ) : null}
                    {/* "Jhal kom" rides on every plate of a month; it belongs
                        beside the name it is for, in a colour that reads as an
                        instruction. */}
                    {o.note ? (
                      <Text
                        numberOfLines={2}
                        style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.saffron, marginTop: 1 }}
                      >
                        “{o.note}”
                      </Text>
                    ) : null}
                  </View>

                  {next ? (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`${t(next)} — ${o.customerName ?? ''}`}
                      onPress={() => {
                        Haptics.selectionAsync().catch(() => {});
                        onAdvance(o.id);
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: radius.pill,
                        backgroundColor: o.status === 'confirmed' ? colors.primary : colors.sage,
                        opacity: pressed ? 0.8 : 1,
                        transform: [{ scale: pressed ? 0.97 : 1 }],
                      })}
                    >
                      <Text style={{ fontFamily: font.uiBold, fontSize: 11.5, color: '#FFFFFF' }}>
                        {t(next)}
                      </Text>
                    </Pressable>
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                      <Icon name="check" size={14} color={colors[state.tone]} strokeWidth={2.6} />
                      <Text style={{ fontFamily: font.uiBold, fontSize: 11.5, color: colors[state.tone] }}>
                        {t(state.label)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })}
          </View>
        ))}

        {bulk ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={bulk.label}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              onAdvanceAll(bulk.ids);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 8,
              paddingVertical: 13,
              borderRadius: radius.pill,
              backgroundColor: waiting.length ? colors.primary : colors.sage,
              opacity: pressed ? 0.88 : 1,
              transform: [{ scale: pressed ? 0.99 : 1 }],
            })}
          >
            <Icon name="check" size={16} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={{ fontFamily: font.uiBold, fontSize: type.sm + 1, color: '#FFFFFF' }}>
              {bulk.label}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export default React.memo(MealSitting);
