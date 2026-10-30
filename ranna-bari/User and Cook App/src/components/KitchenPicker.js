/**
 * Search for one kitchen and pick it.
 *
 * "One cook" on the new-request form used to be a sideways strip of avatars
 * with the first kitchen already chosen. That is fine for three kitchens and
 * useless for thirty: nobody scrolls a strip looking for a name, and a form
 * that picks for you is a form that sends the request to somebody you never
 * chose. So the choice is now explicit and searchable.
 *
 * Two states, one component:
 *   - nothing chosen: a search box over a vertical list of the kitchens that
 *     can reach the customer (name, specialty and area are all searched);
 *   - chosen: the kitchen as a card with a clear (x) that returns to search.
 *
 * Matching goes through `makeMatcher` (src/lib/search), the same engine the
 * Browse screen uses, so a Bengali name finds its Latin-spelled kitchen and
 * the other way round, with a little tolerance for typos. Results are ranked
 * (name prefix first) rather than left in list order.
 *
 * The component owns only the query. Who is chosen is the screen's state, so
 * the `?cook=` deep link and the Send guard read the same value.
 */
import React, { useMemo, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import Icon from './Icon';
import SearchBar from './SearchBar';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { makeMatcher } from '../lib/search';
import { isOpenNow } from '../lib/kitchen';

/* Without a query the list is the whole reachable set, but a very long city
   should not paint hundreds of rows into a form. Typing narrows it. */
const IDLE_LIMIT = 8;

function Row({ chef, onPress, trailing }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const open = isOpenNow(chef);
  return (
    <Pressable
      /* Only a tappable row is a button. The chosen card is not — it carries
         its own clear button, and a button inside a button is invalid markup
         on web (React warns, and the inner tap can be swallowed). */
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={onPress ? chef.name : undefined}
      onPress={onPress}
      disabled={!onPress}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 10,
          borderRadius: radius.sm,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
          transform: [{ scale: pressed && onPress ? 0.99 : 1 }],
        },
        shadow.xs,
      ]}
    >
      <Image
        source={{ uri: chef.avatar }}
        contentFit="cover"
        transition={200}
        style={{ width: 44, height: 44, borderRadius: 14, backgroundColor: colors.sunken }}
      />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}
        >
          {chef.name}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
        >
          {[chef.specialty, chef.area].filter(Boolean).join(' · ')}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          {typeof chef.rating === 'number' && chef.rating > 0 ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
              <Icon name="star" size={11} color={colors.saffron} />
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.text }}>
                {n(Number(chef.rating).toFixed(1))}
              </Text>
            </View>
          ) : null}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: open ? colors.sage : colors.textLight,
              }}
            />
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {open ? t('Open now') : t('Closed')}
            </Text>
          </View>
        </View>
      </View>
      {trailing}
    </Pressable>
  );
}

export default function KitchenPicker({ kitchens, selected, onSelect, hasAddress = true }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const [query, setQuery] = useState('');

  const results = useMemo(() => {
    const matcher = makeMatcher(query.trim());
    if (!matcher) return kitchens.slice(0, IDLE_LIMIT);
    return kitchens
      .map((c) => ({
        c,
        rank: matcher.rank({
          name: c.name,
          tags: [c.specialty, c.area, ...(c.tags ?? [])].filter(Boolean),
        }),
      }))
      .filter((r) => r.rank >= 0)
      .sort((a, b) => a.rank - b.rank)
      .map((r) => r.c);
  }, [kitchens, query]);

  if (selected) {
    return (
      <Row
        chef={selected}
        trailing={
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Choose a different kitchen')}
            hitSlop={10}
            onPress={() => onSelect(null)}
            style={({ pressed }) => ({
              width: 32,
              height: 32,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.sunken,
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <Icon name="x" size={15} color={colors.textMuted} strokeWidth={2.4} />
          </Pressable>
        }
      />
    );
  }

  const hidden = !query.trim() ? Math.max(0, kitchens.length - IDLE_LIMIT) : 0;

  return (
    <View style={{ gap: 10 }}>
      <SearchBar
        value={query}
        onChange={setQuery}
        placeholder={t('Search kitchens by name')}
        autoCorrect={false}
      />

      {!hasAddress ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
          {t('Add your address to see only the kitchens that deliver to you.')}
        </Text>
      ) : null}

      {results.length ? (
        <View style={{ gap: 8 }}>
          {results.map((c) => (
            <Row key={c.id} chef={c} onPress={() => onSelect(String(c.id))} />
          ))}
          {hidden ? (
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.xs,
                color: colors.textLight,
                textAlign: 'center',
              }}
            >
              {t('{n} more. Type a name to find one.', { n: n(hidden) })}
            </Text>
          ) : null}
        </View>
      ) : (
        <View
          style={{
            padding: 16,
            borderRadius: radius.sm,
            backgroundColor: colors.sunken,
            gap: 4,
          }}
        >
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
            {query.trim()
              ? t('No kitchen with that name can reach you')
              : t('No kitchen can reach you right now')}
          </Text>
          <Text
            style={{
              fontFamily: font.ui,
              fontSize: type.xs,
              lineHeight: type.xs * 1.6,
              color: colors.textMuted,
            }}
          >
            {t('Only kitchens that deliver to the address on your account are listed.')}
          </Text>
        </View>
      )}
    </View>
  );
}
