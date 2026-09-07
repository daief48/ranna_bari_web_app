import React, { useCallback, useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Reveal from '../../src/components/Reveal';
import { Body } from '../../src/components/Typography';
import { useAlert } from '../../src/components/Alert';
import { useLang } from '../../src/i18n/LanguageContext';
import { useSession } from '../../src/store/SessionContext';

import {
  BackLink,
  Divider,
  GroupLabel,
  Loading,
  MonthPicker,
  Panel,
  Row,
  SlotToggle,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { fetchCategories } from '../../src/features/meal-management/api';
import { monthLabel, rateText, takaText } from '../../src/features/meal-management/format';

/**
 * The settings that change what a month costs.
 *
 * Two of them, and both are consequential: which categories count toward the
 * rate, and whether a month is closed. The first is the mess owner's own
 * budget decision about their own books — it reaches nobody else's figures —
 * and the second is irreversible here by design, so it asks first and says
 * what it will freeze.
 */
export default function MealManagementSettings() {
  const { t, n, lang } = useLang();
  const { token } = useSession();
  const alert = useAlert();
  const run = useMealAction();

  const { month, summary, loadSummary, updateCategories, settleMonth, changeMonth } =
    useMealManagement();

  const [categories, setCategories] = useState(null);
  const [applicable, setApplicable] = useState([]);
  const [busy, setBusy] = useState(false);

  useFocusEffect(
    useCallback(() => {
      loadSummary(month);
    }, [loadSummary, month]),
  );

  useEffect(() => {
    if (!token) return;
    fetchCategories(token).then((out) => {
      if (out.ok) {
        setCategories(out.result.categories);
        setApplicable(out.result.applicable);
      }
    });
  }, [token]);

  const toggle = (key) => {
    const next = applicable.includes(key)
      ? applicable.filter((c) => c !== key)
      : [...applicable, key];
    setApplicable(next);
    run(() => updateCategories(next));
  };

  const closed = !!summary?.closed;

  const confirmClose = () => {
    alert.confirm({
      title: t('Close {m}?', { m: monthLabel(month, lang) }),
      body: t(
        'Its meals and costs are frozen at ৳{r} a meal across {n} meals. This cannot be undone here.',
        { r: n(rateText(summary?.rate ?? 0)), n: n(summary?.totalMeals ?? 0) },
      ),
      confirmLabel: t('Close the month'),
      onConfirm: async () => {
        setBusy(true);
        await run(() => settleMonth(month), t('Month closed.'));
        setBusy(false);
      },
    });
  };

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('SETTINGS')}
          subtitle={t('What counts, and when a month is final.')}
          style={{ marginTop: 16 }}
        />

        {/* Which costs count. */}
        <Reveal delay={1}>
          <GroupLabel text={t('Costs that count toward your rate')} style={{ marginTop: 26 }} />
          {!categories ? (
            <Loading />
          ) : (
            <Panel style={{ marginTop: 12, gap: 8 }}>
              {categories.map((c) => (
                <SlotToggle
                  key={c.key}
                  label={t(c.label)}
                  taken={applicable.includes(c.key)}
                  onToggle={() => toggle(c.key)}
                />
              ))}
            </Panel>
          )}
          <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18 }}>
            {t('Rent is usually left out — it is a cost of living somewhere, not of eating. Changing this changes your meal rate for every open month.')}
          </Body>
        </Reveal>

        {/* Closing a month. */}
        <Reveal delay={2}>
          <GroupLabel text={t('Close a month')} style={{ marginTop: 30 }} />

          <View style={{ marginTop: 12 }}>
            <MonthPicker month={month} onChange={changeMonth} />
          </View>

          {!summary ? (
            <Loading />
          ) : (
            <Panel style={{ marginTop: 14 }} tone={closed ? 'warn' : undefined}>
              <Row label={t('Meals recorded')} value={n(summary.totalMeals ?? 0)} />
              <Row
                label={t('Costs that count')}
                value={`৳${n(takaText(summary.applicableCost ?? 0))}`}
              />
              <Divider />
              <Row
                label={t('Final rate')}
                value={`৳${n(rateText(summary.rate ?? 0))}`}
                strong
                tone="good"
              />

              {closed ? (
                <Body muted style={{ marginTop: 12 }}>
                  {t('This month is already closed. Its figures are final.')}
                </Body>
              ) : (
                <Button
                  label={busy ? t('Closing…') : t('Close this month')}
                  variant="glass"
                  block
                  disabled={busy || !summary.totalMeals}
                  style={{ marginTop: 14 }}
                  onPress={confirmClose}
                />
              )}
            </Panel>
          )}

          <Body muted style={{ marginTop: 8, fontSize: 12.5, lineHeight: 18, marginBottom: 16 }}>
            {t('Closing takes a snapshot: meals, costs and the rate stop moving, so a settled month reads the same however prices change afterwards.')}
          </Body>
        </Reveal>
      </Container>
    </Screen>
  );
}
