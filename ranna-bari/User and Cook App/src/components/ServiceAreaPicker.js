/**
 * Where a business will deliver, as divisions and the districts inside them.
 *
 * The pin-and-radius slider answered "how far is the map willing to go", which
 * is a question about geometry. This answers the question customers actually
 * ask — "do they come to Gopalganj" — and it is how the app matches: a seller
 * who named their divisions is visible inside them at any distance, and a
 * seller who named none keeps the radius answer, which is why the slider
 * survives underneath this picker rather than being deleted.
 *
 * Value shape (the wire format, mirrored from the seller schemas):
 *   { allBangladesh: bool, serviceAreas: [{ division, areas: [] }] }
 * An empty `areas` array under a division means the whole division; that is
 * what "select all" writes, so "Gopalgonj — all areas" is one row with an
 * empty list, not thirteen ticks.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import Icon from './Icon';
import { BlockLabel } from './StoreBits';
import { Body } from './Typography';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';
import { DIVISIONS, districtNamesOf } from '../lib/bd-areas';

/** The tick a row of choices reads by: a circle, filled when the answer is
    yes, dotted when partly, empty when not. */
function Tick({ on, partial = false, color }) {
  const { colors } = useTheme();
  return (
    <View
      style={{
        width: 19,
        height: 19,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 2,
        borderColor: on || partial ? color : colors.line,
        backgroundColor: on ? color : partial ? colors.sage100 : 'transparent',
      }}
    >
      {on ? <Icon name="check" size={11} color="#FFFFFF" strokeWidth={3} /> : null}
      {!on && partial ? (
        <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
      ) : null}
    </View>
  );
}

export default function ServiceAreaPicker({ value, onChange }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  const allBangladesh = !!value?.allBangladesh;
  const rows = Array.isArray(value?.serviceAreas) ? value.serviceAreas : [];
  /* Which accordion is open. One at a time — sixty-four districts render
     fine, but not all at once on a small screen. */
  const [open, setOpen] = useState(null);

  const emit = (next) => onChange({ allBangladesh, serviceAreas: next });

  const toggleDivisionAll = (division) => {
    Haptics.selectionAsync().catch(() => {});
    const existing = rows.find((r) => r.division === division);
    if (existing && !(existing.areas ?? []).length) {
      /* Whole division was on; the tap turns the division off. */
      emit(rows.filter((r) => r.division !== division));
      return;
    }
    const rest = rows.filter((r) => r.division !== division);
    emit([...rest, { division, areas: [] }]);
  };

  const toggleDistrict = (division, district) => {
    Haptics.selectionAsync().catch(() => {});
    const districts = districtNamesOf(division);
    const existing = rows.find((r) => r.division === division);
    const current = existing ? (existing.areas ?? []) : [];

    let next;
    if (!current.length) {
      /* Whole division was on. Tapping one district narrows it to "every
         district except this one" — the only honest reading of unticking
         inside "all". */
      next = districts.filter((d) => d !== district);
    } else if (current.includes(district)) {
      next = current.filter((d) => d !== district);
    } else {
      next = [...current, district];
      if (next.length >= districts.length) next = []; // back to "the whole division"
    }

    if (!next.length && current.length && existing && current.length !== districts.length) {
      /* Every chip got unticked by hand — that reads as "not this division",
         not as "all of it". */
      emit(rows.filter((r) => r.division !== division));
      return;
    }
    const rest = rows.filter((r) => r.division !== division);
    emit(next.length ? [...rest, { division, areas: next }] : [...rest, { division, areas: [] }]);
  };

  const rowFor = (division) => rows.find((r) => r.division === division) ?? null;

  /* The line the cook reads back: what the customer side will match against. */
  const summary = allBangladesh
    ? t('Delivering all over Bangladesh.')
    : rows.length
      ? t('Delivering to: {list}', {
          list: rows
            .map((r) => (!(r.areas ?? []).length ? t('{d} (all)', { d: r.division }) : r.division))
            .join(', '),
        })
      : t('No coverage chosen — the delivery radius decides who sees you.');

  return (
    <View>
      <BlockLabel text={t('Where you deliver')} />

      {/* ---- the master switch ---- */}
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: allBangladesh }}
        onPress={() => {
          Haptics.selectionAsync().catch(() => {});
          onChange({ allBangladesh: !allBangladesh, serviceAreas: value?.serviceAreas ?? [] });
        }}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          paddingVertical: 12,
          paddingHorizontal: 14,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: allBangladesh ? colors.sage : colors.line,
          backgroundColor: allBangladesh ? colors.sage50 : pressed ? colors.sunken : 'transparent',
          marginBottom: 12,
          opacity: pressed ? 0.95 : 1,
        })}
      >
        <Tick on={allBangladesh} color={colors.sage} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.sm,
              color: colors.text,
            }}
          >
            {t('All over Bangladesh')}
          </Text>
          <Body muted size={12}>
            {t('Every customer, in any division, can see and order from you.')}
          </Body>
        </View>
      </Pressable>

      {!allBangladesh ? (
        <View style={{ gap: 8 }}>
          {DIVISIONS.map((division) => {
            const row = rowFor(division.name);
            const whole = !!row && !(row.areas ?? []).length;
            const picked = row ? (row.areas ?? []).length : 0;
            const isOpen = open === division.name;
            return (
              <View
                key={division.name}
                style={{
                  borderRadius: radius.md,
                  borderWidth: 1,
                  borderColor: row ? colors.sage : colors.line,
                  overflow: 'hidden',
                }}
              >
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ expanded: isOpen }}
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setOpen(isOpen ? null : division.name);
                  }}
                  style={({ pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    backgroundColor: pressed ? colors.sunken : row ? colors.sage50 : 'transparent',
                  })}
                >
                  <Tick on={whole} partial={picked > 0 && !whole} color={colors.sage} />
                  <Text
                    style={{
                      flex: 1,
                      fontFamily: row ? font.uiBold : font.uiSemi,
                      fontSize: type.sm + 1,
                      color: colors.text,
                    }}
                  >
                    {division.name}
                    {whole
                      ? ` — ${t('all')}`
                      : picked
                        ? ` — ${t('{n} districts', { n: n(picked) })}`
                        : ''}
                  </Text>
                  <Icon
                    name={isOpen ? 'chevronDown' : 'chevronRight'}
                    size={14}
                    color={colors.textMuted}
                    strokeWidth={2.2}
                  />
                </Pressable>

                {isOpen ? (
                  <View style={{ padding: 12, paddingTop: 4, gap: 10 }}>
                    <Pressable
                      accessibilityRole="button"
                      onPress={() => toggleDivisionAll(division.name)}
                      style={({ pressed }) => ({
                        alignSelf: 'flex-start',
                        paddingVertical: 7,
                        paddingHorizontal: 12,
                        borderRadius: radius.pill,
                        borderWidth: 1,
                        borderColor: whole ? colors.sage : colors.line,
                        backgroundColor: whole ? colors.sage : colors.surfaceSolid,
                        opacity: pressed ? 0.85 : 1,
                      })}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiSemi,
                          fontSize: type.xs,
                          color: whole ? '#FFFFFF' : colors.textMuted,
                        }}
                      >
                        {whole
                          ? t('Unselect all of {division}', { division: division.name })
                          : t('Select all of {division}', { division: division.name })}
                      </Text>
                    </Pressable>

                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                      {districtNamesOf(division.name).map((district) => {
                        const on = whole || (row?.areas ?? []).includes(district);
                        return (
                          <Pressable
                            key={district}
                            accessibilityRole="button"
                            accessibilityState={{ selected: on }}
                            onPress={() => toggleDistrict(division.name, district)}
                            style={({ pressed }) => ({
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: radius.pill,
                              backgroundColor: on ? colors.sage : colors.surfaceSolid,
                              borderWidth: 1,
                              borderColor: on ? colors.sage : colors.line,
                              transform: [{ scale: pressed ? 0.96 : 1 }],
                            })}
                          >
                            <Text
                              style={{
                                fontFamily: on ? font.uiBold : font.uiSemi,
                                fontSize: 12.5,
                                color: on ? '#FFFFFF' : colors.textMuted,
                              }}
                            >
                              {district}
                            </Text>
                          </Pressable>
                        );
                      })}
                    </View>
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <Body muted size={13} style={{ marginTop: 10 }}>
        {summary}
      </Body>
    </View>
  );
}
