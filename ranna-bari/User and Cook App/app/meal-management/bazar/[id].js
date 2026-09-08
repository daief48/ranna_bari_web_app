import React, { useCallback, useState } from 'react';
import { Text, View } from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';

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
  Divider,
  ErrorState,
  GroupLabel,
  Loading,
  MiniButton,
  Panel,
  Row,
  StatusPill,
} from '../../../src/features/meal-management/components';
import { useMealManagement } from '../../../src/features/meal-management/store';
import { useMealAction, mealErrorText } from '../../../src/features/meal-management/errors';
import { dayLabel, mealText, takaText } from '../../../src/features/meal-management/format';

import { BazarSheet } from '../../../src/features/meal-management/forms';

/**
 * One shopping trip, in full. §4.3, steps 6 to 8.
 *
 * The approver's screen. Everything they need to decide is on it — the lines,
 * the total, who paid, the receipt — because §4.3's approval step is the last
 * gate before this money reaches every member's bill.
 */
export default function BazarDetail() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { t, n, lang } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { getBazar, decideBazar, submitBazar, updateBazar, removeBazar } = useMealManagement();

  const [bazar, setBazar] = useState(null);
  const [failure, setFailure] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const fetch = useCallback(async () => {
    setLoading(true);
    const out = await getBazar(id);
    if (out.ok) {
      setBazar(out.result);
      setFailure(null);
    } else {
      setFailure(out);
    }
    setLoading(false);
  }, [getBazar, id]);

  useFocusEffect(
    useCallback(() => {
      fetch();
    }, [fetch]),
  );

  const act = async (write, message) => {
    setBusy(true);
    const out = await run(write, message);
    setBusy(false);
    if (out?.ok) await fetch();
    return out;
  };

  if (loading && !bazar) {
    return (
      <MessScreen>
        <Container>
          <BackLink fallback="/meal-management/bazar" />
          <Loading />
        </Container>
      </MessScreen>
    );
  }

  if (failure || !bazar) {
    return (
      <MessScreen>
        <Container>
          <BackLink fallback="/meal-management/bazar" />
          <View style={{ marginTop: 18 }}>
            <ErrorState
              message={failure ? mealErrorText(failure, t, n) : t('That bazar could not be found.')}
              onRetry={fetch}
            />
          </View>
        </Container>
      </MessScreen>
    );
  }

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/bazar" />

        <SectionHeader
          lead={t('BAZAR')}
          accent={dayLabel(bazar.date, lang).toUpperCase()}
          subtitle={t('{buyer} shopped · paid by {payer}', {
            buyer: bazar.buyerName,
            payer: bazar.payerName,
          })}
          style={{ marginTop: 16 }}
        />

        <Panel style={{ marginTop: 18, gap: 10 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <StatusPill status={bazar.status} />
            <Text
              style={{
                fontFamily: font.displayBold,
                fontSize: 30,
                color: colors.text,
                fontVariant: ['tabular-nums'],
              }}
            >
              ৳{n(takaText(bazar.total))}
            </Text>
          </View>

          {bazar.status === 'approved' ? (
            <Body muted style={{ fontSize: type.xs }}>
              {t('This is in the meal rate for the month.')}
            </Body>
          ) : bazar.status === 'submitted' ? (
            <Body muted style={{ fontSize: type.xs }}>
              {t('Waiting for approval. It is not in the rate yet.')}
            </Body>
          ) : bazar.status === 'rejected' ? (
            <Body muted style={{ fontSize: type.xs }}>
              {bazar.decisionNote || t('This was rejected and counts for nothing.')}
            </Body>
          ) : (
            <Body muted style={{ fontSize: type.xs }}>
              {t('A draft. Submit it when the list is complete.')}
            </Body>
          )}
        </Panel>

        <View style={{ marginTop: 20, gap: 10 }}>
          <GroupLabel text={t('What was bought')} />

          <Panel style={{ gap: 0 }}>
            {bazar.items.length ? (
              <>
                {bazar.items.map((item) => (
                  <Row
                    key={item.id}
                    label={`${item.name} · ${mealText(item.qty)} ${t(item.unit)} × ৳${n(takaText(item.unitPrice))}`}
                    value={`৳${n(takaText(item.total))}`}
                  />
                ))}
                <Divider />
                <Row label={t('Total')} value={`৳${n(takaText(bazar.total))}`} strong />
              </>
            ) : (
              <Body muted style={{ paddingVertical: 12 }}>
                {t('No items on this bazar yet.')}
              </Body>
            )}
          </Panel>

          {bazar.note ? (
            <Panel style={{ gap: 5 }}>
              <GroupLabel text={t('Note')} />
              <Body>{bazar.note}</Body>
            </Panel>
          ) : null}
        </View>

        {/* ---- what can still be done to it ---- */}
        <View style={{ marginTop: 22, gap: 10, marginBottom: 8 }}>
          {bazar.status === 'submitted' && bazar.canApprove ? (
            <>
              <GroupLabel text={t('Decide')} />
              <ApprovalActions
                busy={busy}
                onApprove={() => act(() => decideBazar(bazar.id, true), t('Bazar approved.'))}
                onReject={() => act(() => decideBazar(bazar.id, false), t('Bazar rejected.'))}
              />
              <Body muted style={{ fontSize: type.xs }}>
                {t('Approving puts ৳{n} into this month’s food cost.', { n: n(takaText(bazar.total)) })}
              </Body>
            </>
          ) : null}

          {bazar.canEdit ? (
            <>
              <MiniButton
                label={t('Edit the list')}
                icon="sliders"
                tone="plain"
                onPress={() => setEditing(true)}
              />
              {bazar.status === 'draft' || bazar.status === 'rejected' ? (
                <Button
                  label={t('Submit for approval')}
                  onPress={() => act(() => submitBazar(bazar.id), t('Submitted.'))}
                  disabled={busy || !bazar.items.length}
                  block
                />
              ) : null}
              <MiniButton
                label={bazar.status === 'draft' ? t('Delete this draft') : t('Withdraw this bazar')}
                icon="x"
                tone="bad"
                onPress={async () => {
                  const out = await act(() => removeBazar(bazar.id), t('Removed.'));
                  if (out?.ok) router.replace('/meal-management/bazar');
                }}
              />
            </>
          ) : null}

          {!bazar.canEdit && bazar.status === 'approved' ? (
            <Panel style={{ gap: 5 }}>
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                {t('This is locked')}
              </Text>
              <Body muted style={{ fontSize: type.xs }}>
                {t(
                  'An approved bazar cannot be edited — the month’s figures rest on it. A mistake is corrected with an adjustment instead.',
                )}
              </Body>
            </Panel>
          ) : null}
        </View>
      </Container>

      <BazarSheet
        open={editing}
        onClose={() => setEditing(false)}
        initial={bazar}
        onSubmit={async (body) => {
          const out = await act(() => updateBazar(bazar.id, body), t('Bazar updated.'));
          if (out?.ok) setEditing(false);
          return out;
        }}
      />
    </MessScreen>
  );
}
