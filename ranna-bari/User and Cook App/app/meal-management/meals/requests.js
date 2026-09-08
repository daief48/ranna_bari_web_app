import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  ApprovalActions,
  BackLink,
  Chip,
  ChipRow,
  DatePicker,
  Divider,
  Empty,
  Field,
  GroupLabel,
  Loading,
  MiniButton,
  Panel,
  Row,
  Sheet,
  StatusPill,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import { agoLabel, dayLabel, mealText, todayKey } from '../../../src/features/meal-management/format';

/**
 * Meal corrections. §4.2, steps 6 to 8.
 *
 * The screen that makes a cutoff bearable. A locked day is not an argument
 * with the app — it is a request, and this is where it goes and where somebody
 * decides it.
 *
 * A pending request shows *both* figures, the current and the asked-for, side
 * by side. That is the whole reason the request holds its own copy of each:
 * an approver deciding blind is an approver who approves everything.
 */
export default function MealRequests() {
  const params = useLocalSearchParams();
  const { t, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { mealTypes, requestCorrection, decideCorrection, load } = useMealManagement();
  const { data, loading } = useSlice('corrections');

  const [raising, setRaising] = useState(params.new === '1');
  const [busy, setBusy] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load.corrections({ force: true });
    }, [load]),
  );

  const requests = data?.requests ?? [];
  const canApprove = !!data?.canApprove;

  const decide = async (id, approve) => {
    setBusy(id);
    await run(
      () => decideCorrection(id, approve),
      approve ? t('Correction approved.') : t('Correction rejected.'),
    );
    setBusy(null);
  };

  /** A `{ lunch: 1 }` map, said in words. */
  const describe = (map) => {
    const entries = Object.entries(map ?? {}).filter(([, value]) => Number(value) > 0);
    if (!entries.length) return t('nothing');
    return entries
      .map(([key, value]) => {
        const label = mealTypes.find((type_) => type_.key === key)?.label ?? key;
        return `${t(label)} ${mealText(value)}`;
      })
      .join(', ');
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/meals" />

        <SectionHeader
          lead={t('MEAL')}
          accent={t('CORRECTIONS')}
          subtitle={
            canApprove
              ? t('Requests to change a meal after its cutoff.')
              : t('Ask for a locked day to be changed.')
          }
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 18 }}>
          <MiniButton
            label={t('Request a correction')}
            icon="plus"
            onPress={() => setRaising(true)}
          />
        </View>

        {loading && !data ? (
          <Loading />
        ) : !requests.length ? (
          <View style={{ marginTop: 18 }}>
            <Empty
              icon="clock"
              title={t('Nothing waiting')}
              hint={t('A correction request appears here once somebody raises one.')}
            />
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 12 }}>
            {requests.map((request) => (
              <Panel key={request.id} tone={request.status === 'pending' ? 'warn' : undefined} style={{ gap: 10 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                      {dayLabel(request.date, lang)}
                    </Text>
                    <Text style={{ marginTop: 2, fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
                      {request.memberName} · {agoLabel(request.at, t)}
                    </Text>
                  </View>
                  <StatusPill status={request.status} />
                </View>

                <Divider />

                <Row label={t('Recorded now')} value={describe(request.current?.values)} />
                <Row
                  label={t('Asking for')}
                  value={describe(request.requested?.values)}
                  tone="good"
                  strong
                />

                {request.reason ? (
                  <>
                    <Divider />
                    <Body muted style={{ fontSize: type.xs }}>
                      “{request.reason}”
                    </Body>
                  </>
                ) : null}

                {request.status === 'pending' && canApprove ? (
                  <ApprovalActions
                    busy={busy === request.id}
                    onApprove={() => decide(request.id, true)}
                    onReject={() => decide(request.id, false)}
                  />
                ) : null}

                {request.status !== 'pending' && request.decisionNote ? (
                  <Body muted style={{ fontSize: type.xs }}>
                    {request.decisionNote}
                  </Body>
                ) : null}
              </Panel>
            ))}
          </View>
        )}

        {!canApprove ? (
          <Panel style={{ marginTop: 18, gap: 5 }}>
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
              {t('How this works')}
            </Text>
            <Body muted style={{ fontSize: type.xs }}>
              {t(
                'Nothing changes while a request is waiting. Only an approved correction reaches the month’s figures, so the rate cannot move behind anybody’s back.',
              )}
            </Body>
          </Panel>
        ) : null}
      </Container>

      <RaiseSheet
        open={raising}
        onClose={() => setRaising(false)}
        mealTypes={mealTypes}
        date={typeof params.date === 'string' ? params.date : todayKey()}
        onSubmit={async (body) => {
          const out = await run(() => requestCorrection(body), t('Your request has been sent.'));
          if (out?.ok) setRaising(false);
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * raising one
 * ------------------------------------------------------------------ */

function RaiseSheet({ open, onClose, mealTypes, date: initialDate, onSubmit }) {
  const { t } = useLang();

  const [date, setDate] = useState(initialDate);
  const [values, setValues] = useState({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    await onSubmit({ date, values, reason: reason.trim() || undefined });
    setBusy(false);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Request a correction')}
      footer={<Button label={t('Send the request')} onPress={submit} disabled={busy} block />}
    >
      <DatePicker label={t('Which day')} value={date} onChange={setDate} />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('What it should be')} />
        {mealTypes.map((type_) => (
          <View
            key={type_.key}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Body>{t(type_.label)}</Body>
            <ChipRow>
              <Chip
                label={t('Off')}
                active={values[type_.key] === 0}
                tone="bad"
                onPress={() => setValues((prev) => ({ ...prev, [type_.key]: 0 }))}
              />
              <Chip
                label={t('On')}
                active={Number(values[type_.key]) > 0}
                tone="good"
                onPress={() => setValues((prev) => ({ ...prev, [type_.key]: 1 }))}
              />
            </ChipRow>
          </View>
        ))}
      </View>

      <Field
        label={t('Why (optional)')}
        value={reason}
        onChangeText={setReason}
        placeholder={t('e.g. I was here but forgot to turn it on')}
        multiline
        maxLength={500}
      />

      <Body muted style={{ fontSize: 12 }}>
        {t('An admin or co-admin decides. Nothing changes until they do.')}
      </Body>
    </Sheet>
  );
}
