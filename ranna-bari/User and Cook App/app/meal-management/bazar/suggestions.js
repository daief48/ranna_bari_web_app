import React, { useCallback, useEffect, useState } from 'react';
import { Text, View } from 'react-native';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Divider,
  Empty,
  GroupLabel,
  Loading,
  Panel,
  Row,
  StatTile,
  TileGrid,
} from '../../../src/features/meal-management/components';
import { useMealManagement } from '../../../src/features/meal-management/store';
import { mealText, takaText } from '../../../src/features/meal-management/format';

/**
 * What the mess usually buys. §4.15's bazar suggestion.
 *
 * The specification puts this under AI, and it is — just not the kind that
 * needs a model. The suggestion is the average quantity per trip over the last
 * ninety days of approved bazar, which is a figure the mess can check against
 * its own receipts.
 *
 * The basis line is shown on purpose. §4.15's last rule asks that an
 * explanation identify its data, and a suggested five kilos of rice means
 * something quite different from ten trips than it does from two.
 */
export default function BazarSuggestions() {
  const { t, n } = useLang();
  const { colors } = useTheme();

  const { getBazarSuggestions, getPrediction } = useMealManagement();

  const [data, setData] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetch = useCallback(async () => {
    setLoading(true);
    const [suggestions, forecast] = await Promise.all([getBazarSuggestions(), getPrediction()]);
    setData(suggestions.ok ? suggestions.result : null);
    setPrediction(forecast.ok ? forecast.result : null);
    setLoading(false);
  }, [getBazarSuggestions, getPrediction]);

  useEffect(() => {
    fetch();
  }, [fetch]);

  const items = data?.items ?? [];

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/bazar" />

        <SectionHeader
          lead={t('WHAT TO')}
          accent={t('BUY')}
          subtitle={t('From what this mess has actually bought and eaten.')}
          style={{ marginTop: 16 }}
        />

        {loading ? (
          <Loading />
        ) : (
          <>
            {/* ---- §4.15's meal prediction, which is what sizes a bazar ---- */}
            {prediction ? (
              <View style={{ marginTop: 18, gap: 10 }}>
                <GroupLabel text={t('Expected tomorrow')} />

                <TileGrid>
                  {(prediction.slots ?? []).map((slot) => (
                    <StatTile
                      key={slot.mealType}
                      value={n(slot.cook)}
                      label={t(slot.label)}
                      hint={t('{n}% usually turn up', { n: n(slot.attendanceRate) })}
                      tone={slot.confidence === 'high' ? 'good' : slot.confidence === 'low' ? 'warn' : undefined}
                    />
                  ))}
                </TileGrid>

                <Body muted style={{ fontSize: type.xs }}>
                  {prediction.basis}
                </Body>
              </View>
            ) : null}

            {/* ---- the shopping list ---- */}
            <View style={{ marginTop: 22, gap: 10, marginBottom: 8 }}>
              <GroupLabel text={t('Usual quantities per trip')} />

              {items.length ? (
                <>
                  <Panel style={{ gap: 0 }}>
                    {items.map((item) => (
                      <Row
                        key={item.name}
                        label={`${item.name} · ${t('seen in {n} trips', { n: n(item.seenIn) })}`}
                        value={`${mealText(item.suggestedQty)} ${t(item.unit)}`}
                      />
                    ))}
                    <Divider />
                    <Row
                      label={t('Typical spend per trip')}
                      value={`৳${n(takaText(items.reduce((sum, item) => sum + item.averageSpend, 0)))}`}
                      strong
                    />
                  </Panel>

                  <Panel style={{ gap: 5 }}>
                    <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                      {t('Where this comes from')}
                    </Text>
                    <Body muted style={{ fontSize: type.xs }}>
                      {data.basis}
                    </Body>
                    <Body muted style={{ fontSize: type.xs }}>
                      {t('Only items bought on at least two trips are listed — one purchase is not a pattern.')}
                    </Body>
                  </Panel>
                </>
              ) : (
                <Empty
                  icon="cart"
                  title={t('Not enough history yet')}
                  hint={t('Record a few bazar trips with their items and suggestions appear here.')}
                />
              )}
            </View>
          </>
        )}
      </Container>
    </MessScreen>
  );
}
