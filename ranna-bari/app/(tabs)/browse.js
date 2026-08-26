import React, { useMemo, useState } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import ChefCard from '../../src/components/ChefCard';
import SectionHeader from '../../src/components/SectionHeader';
import { useTheme } from '../../src/theme/ThemeProvider';
import useResponsive from '../../src/theme/useResponsive';
import { font, radius, tracking, type } from '../../src/theme/tokens';
import { useAreas, useChefs } from '../../src/data';

/** The five chips on browsecook.html, in order. */
const CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'breakfast', label: 'Morning' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Evening' },
  { key: 'healthy', label: 'Healthy' },
];

export default function BrowseScreen() {
  const chefs = useChefs();
  const { colors, shadow } = useTheme();
  const r = useResponsive();
  const router = useRouter();
  const params = useLocalSearchParams();

  // Both entry points from the home screen: a mood pill sends `filter`,
  // the hero search sends `q`.
  const [filter, setFilter] = useState(
    typeof params.filter === 'string' ? params.filter : 'all',
  );
  const [query, setQuery] = useState(typeof params.q === 'string' ? params.q : '');
  const [area, setArea] = useState('all');
  const [areaOpen, setAreaOpen] = useState(false);

  /**
   * The web build's render(): category match is a tag membership test, search
   * matches name / specialty / any tag. The area <select> was inert there --
   * it had no listener at all -- so it is wired up here.
   */
  const results = useMemo(() => {
    const q = query.trim().toLowerCase();

    return chefs.filter((chef) => {
      const matchesCategory = filter === 'all' || chef.tags.includes(filter);
      const matchesArea = area === 'all' || chef.area === area;

      const matchesSearch =
        !q ||
        chef.name.toLowerCase().includes(q) ||
        chef.specialty.toLowerCase().includes(q) ||
        chef.area.toLowerCase().includes(q) ||
        chef.tags.some((t) => t.toLowerCase().includes(q));

      return matchesCategory && matchesArea && matchesSearch;
    });
  }, [filter, query, area, chefs]);

  /* A chip that is active but absent from the five defaults (a mood pill sent
     us here) still needs somewhere to show, so it is appended to the row. */
  const chips = useMemo(() => {
    if (filter === 'all' || CHIPS.some((c) => c.key === filter)) return CHIPS;
    return [...CHIPS, { key: filter, label: filter }];
  }, [filter]);

  return (
    <Screen>
      <Container>
        <SectionHeader
          lead="DISCOVER"
          accent="ARTISANS"
          subtitle="Find the perfect meal curated by local chefs."
          style={{ marginBottom: 24 }}
        />

        {/* ---- FILTER BAR ----
            On phones the card chrome is dropped: pills inside a pill-shaped
            card reads as clutter and costs ~32px of width, so each control
            carries its own surface.

              search
              area | map
              chips -> -> -> */}
        <View
          style={[
            {
              flexDirection: 'row',
              alignItems: 'center',
              height: 52,
              paddingRight: 6,
              borderRadius: radius.pill,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              marginBottom: 10,
            },
            shadow.sm,
          ]}
        >
          <Icon
            name="search"
            size={18}
            color={colors.textMuted}
            style={{ marginLeft: 16 }}
          />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search cuisines, chefs, or areas..."
            placeholderTextColor={colors.textLight}
            returnKeyType="search"
            style={{
              flex: 1,
              minWidth: 0,
              fontFamily: font.ui,
              fontSize: 16,
              color: colors.text,
              paddingHorizontal: 12,
            }}
          />
          {query ? (
            <Pressable
              onPress={() => setQuery('')}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Clear search"
              style={{ paddingHorizontal: 8 }}
            >
              <Icon name="x" size={16} color={colors.textMuted} />
            </Pressable>
          ) : null}
        </View>

        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Filter by area, currently ${area === 'all' ? 'all areas' : area}`}
            onPress={() => setAreaOpen(true)}
            style={({ pressed }) => [
              {
                flex: 1,
                height: 52,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                paddingHorizontal: 16,
                borderRadius: radius.pill,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: pressed ? colors.primary200 : colors.line,
              },
              shadow.sm,
            ]}
          >
            <Icon name="pin" size={17} color={colors.textMuted} />
            <Text
              numberOfLines={1}
              style={{
                flex: 1,
                fontFamily: font.uiSemi,
                fontSize: 16,
                color: colors.text,
              }}
            >
              {area === 'all' ? 'All Areas' : area}
            </Text>
            <Icon name="chevronDown" size={16} color={colors.textMuted} />
          </Pressable>

          {/* The one visual call to action on the page: a solid accent button */}
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="View kitchens on the map"
            onPress={() => router.push('/map')}
            style={({ pressed }) => [
              {
                width: 52,
                height: 52,
                borderRadius: radius.pill,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primary,
                transform: [{ scale: pressed ? 0.96 : 1 }],
              },
              shadow.primary,
            ]}
          >
            <Icon name="map" size={20} color="#FFFFFF" />
          </Pressable>
        </View>
      </Container>

      {/* Chips bleed to the screen edges so a part-cut chip is an honest
          "there is more, scroll me" signal. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{
          gap: 8,
          paddingHorizontal: r.gutter,
          paddingVertical: 2,
        }}
      >
        {chips.map((c) => {
          const active = filter === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => setFilter(c.key)}
              style={({ pressed }) => [
                {
                  paddingVertical: 11,
                  paddingHorizontal: 18,
                  borderRadius: radius.pill,
                  backgroundColor: active ? colors.primary : colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: active ? colors.primary : colors.line,
                  transform: [{ scale: pressed ? 0.97 : 1 }],
                },
                active ? shadow.primary : shadow.xs,
              ]}
            >
              <Text
                style={{
                  fontFamily: font.uiSemi,
                  fontSize: 13,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: active ? '#FFFFFF' : colors.textMuted,
                }}
              >
                {c.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <Container style={{ paddingTop: 24 }}>
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: type.sm,
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: colors.textMuted,
            marginBottom: 24,
          }}
        >
          {results.length} Artisans Curated For You
        </Text>

        {results.length ? (
          <View style={{ gap: 16 }}>
            {results.map((c, i) => (
              <ChefCard key={c.id} chef={c} index={i} />
            ))}
          </View>
        ) : (
          <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
            <Icon name="searchCheck" size={32} color={colors.textLight} />
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.sm + 1,
                textAlign: 'center',
                color: colors.textMuted,
              }}
            >
              No artisans found matching your criteria.
            </Text>
          </View>
        )}
      </Container>

      <AreaPicker
        open={areaOpen}
        value={area}
        onSelect={(v) => {
          setArea(v);
          setAreaOpen(false);
        }}
        onClose={() => setAreaOpen(false)}
      />
    </Screen>
  );
}

/** Bottom sheet standing in for the web build's native <select>. */
function AreaPicker({ open, value, onSelect, onClose }) {
  const { colors, shadow } = useTheme();
  const areas = useAreas();

  return (
    <Modal
      visible={open}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
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
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
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
              Choose an area
            </Text>
            <Pressable onPress={onClose} hitSlop={10} accessibilityLabel="Close">
              <Icon name="x" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 340 }}>
            {areas.map((a) => {
              const active = a === value;
              return (
                <Pressable
                  key={a}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  onPress={() => onSelect(a)}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    paddingHorizontal: 16,
                    paddingVertical: 14,
                    backgroundColor:
                      active || pressed ? colors.primary50 : 'transparent',
                  })}
                >
                  <Icon
                    name="pin"
                    size={17}
                    color={active ? colors.primary : colors.textMuted}
                  />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: active ? font.uiSemi : font.ui,
                      fontSize: 16,
                      color: active ? colors.primary : colors.text,
                    }}
                  >
                    {a === 'all' ? 'All Areas' : a}
                  </Text>
                  {active ? (
                    <Icon name="check" size={17} color={colors.primary} strokeWidth={2.2} />
                  ) : null}
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
