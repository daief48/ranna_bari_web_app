import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Field,
  GroupLabel,
  MemberRow,
  MiniButton,
  Panel,
  Segmented,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { ROLE_TEXT } from '../../src/features/meal-management/format';

/**
 * Create a mess, join one, or switch between them. §4.1.
 *
 * One screen for all three because they are the same question asked at
 * different times — "which books am I keeping?" — and a person who has just
 * been given a code should not have to find a different screen from the one
 * they landed on.
 */
export default function Onboard() {
  const router = useRouter();
  const { t } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { messes, messId, chooseMess, createMess, joinMess } = useMealManagement();

  const active = (messes ?? []).filter((m) => m.status === 'active');
  const waiting = (messes ?? []).filter((m) => m.status === 'pending');

  const [mode, setMode] = useState(active.length ? 'switch' : 'create');
  const [name, setName] = useState('');
  const [area, setArea] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);

  const create = async () => {
    if (!name.trim()) return;
    setBusy(true);
    const out = await run(
      () => createMess({ name: name.trim(), area: area.trim() || undefined }),
      t('Your mess is ready.'),
    );
    setBusy(false);
    if (out?.ok) router.replace('/meal-management');
  };

  const join = async () => {
    if (!code.trim()) return;
    setBusy(true);
    const out = await run(() => joinMess(code.trim()));
    setBusy(false);

    if (!out?.ok) return;
    if (out.result.status === 'joined') {
      chooseMess(out.result.messId);
      router.replace('/meal-management');
    } else {
      setCode('');
    }
  };

  const options = [
    ...(active.length ? [{ value: 'switch', label: t('My messes') }] : []),
    { value: 'create', label: t('Create') },
    { value: 'join', label: t('Join') },
  ];

  return (
    <Screen>
      <Container>
        <BackLink />

        <SectionHeader
          lead={t('YOUR')}
          accent={t('MESS')}
          subtitle={t('Every meal, expense and payment belongs to one mess.')}
          style={{ marginTop: 16 }}
        />

        <View style={{ marginTop: 20 }}>
          <Segmented options={options} value={mode} onChange={setMode} />
        </View>

        {waiting.length ? (
          <Panel tone="warn" style={{ marginTop: 18, gap: 6 }}>
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.saffron }}>
              {t('{n} join request waiting', { n: waiting.length })}
            </Text>
            <Body muted>{t('An admin has to approve you before you can start recording meals.')}</Body>
          </Panel>
        ) : null}

        {mode === 'switch' ? (
          <View style={{ marginTop: 20, gap: 10 }}>
            <GroupLabel text={t('Messes you are in')} />
            <Panel style={{ gap: 2 }}>
              {active.map((m) => (
                <MemberRow
                  key={m.messId}
                  name={m.name}
                  role={t(ROLE_TEXT[m.role] ?? m.role)}
                  sub={m.area || undefined}
                  right={
                    m.messId === messId ? (
                      <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.sage }}>
                        {t('Open')}
                      </Text>
                    ) : (
                      <MiniButton
                        label={t('Switch')}
                        tone="plain"
                        onPress={() => {
                          chooseMess(m.messId);
                          router.replace('/meal-management');
                        }}
                      />
                    )
                  }
                />
              ))}
            </Panel>

            <Body muted style={{ fontSize: type.xs }}>
              {t('A mess keeps its own meals, money and members. Nothing crosses between them.')}
            </Body>
          </View>
        ) : null}

        {mode === 'create' ? (
          <View style={{ marginTop: 20, gap: 14 }}>
            <GroupLabel text={t('Start a new mess')} />

            <Field
              label={t('Mess name')}
              value={name}
              onChangeText={setName}
              placeholder={t('e.g. Shanti Bhaban 3B')}
              maxLength={80}
            />
            <Field
              label={t('Area (optional)')}
              value={area}
              onChangeText={setArea}
              placeholder={t('e.g. Mirpur 10')}
              maxLength={120}
            />

            <Panel style={{ gap: 6 }}>
              <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
                {t('What you get')}
              </Text>
              <Body muted style={{ fontSize: type.xs }}>
                {t(
                  'Breakfast, lunch and dinner with cutoffs; eleven expense categories with rent and wifi kept out of the meal rate; and a join code to share.',
                )}
              </Body>
            </Panel>

            <Button
              label={t('Create the mess')}
              onPress={create}
              disabled={busy || !name.trim()}
              block
            />
          </View>
        ) : null}

        {mode === 'join' ? (
          <View style={{ marginTop: 20, gap: 14 }}>
            <GroupLabel text={t('Join with a code')} />

            <Field
              label={t('Join code')}
              value={code}
              onChangeText={(value) => setCode(value.toUpperCase())}
              placeholder="ABC123"
              autoCapitalize="characters"
              maxLength={12}
              hint={t('Ask an admin of the mess for its code.')}
            />

            <Button label={t('Join')} onPress={join} disabled={busy || !code.trim()} block />

            <Body muted style={{ fontSize: type.xs }}>
              {t('Some messes approve new members before they can start. You will be told either way.')}
            </Body>
          </View>
        ) : null}
      </Container>
    </Screen>
  );
}
