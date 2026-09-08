import React, { useCallback, useRef, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import Icon from '../../src/components/Icon';
import { Body } from '../../src/components/Typography';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  BackLink,
  Field,
  GroupLabel,
  Loading,
  MiniButton,
  Panel,
} from '../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { agoLabel } from '../../src/features/meal-management/format';

/**
 * The assistant. §4.15.
 *
 * It proposes; it never performs. Every instruction comes back as a sentence
 * and a Confirm button, which is §4.15's *high-impact changes should require
 * user confirmation* written as an interface rather than as a promise.
 *
 * The suggestions below the box are the shapes it actually understands, in
 * both languages. An assistant that silently fails on nine sentences out of
 * ten is worse than no assistant, so this one shows its vocabulary.
 */
const EXAMPLES = [
  'আগামীকাল রাতে আমি meal খাব না।',
  'Turn my lunch off tomorrow',
  'আমার কত খরচ হয়েছে?',
  'Turn breakfast on today',
];

export default function Assistant() {
  const { t, n } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { askAssistant, confirmAssistant, load } = useMealManagement();
  const { data, loading } = useSlice('assistant');

  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [proposal, setProposal] = useState(null);
  const scroller = useRef(null);

  useFocusEffect(
    useCallback(() => {
      load.assistant({ force: true });
    }, [load]),
  );

  const ask = async (sentence) => {
    const value = (sentence ?? text).trim();
    if (!value) return;

    setBusy(true);
    setProposal(null);
    const out = await run(() => askAssistant(value));
    setBusy(false);
    setText('');

    if (out?.ok && out.result.kind === 'proposal') setProposal(out.result);
    if (out?.ok) load.assistant({ force: true });
  };

  const confirm = async () => {
    if (!proposal) return;
    setBusy(true);
    const out = await run(() => confirmAssistant(proposal.proposalId), t('Done.'));
    setBusy(false);
    if (out?.ok) {
      setProposal(null);
      load.assistant({ force: true });
    }
  };

  const messages = data?.messages ?? [];

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('THE')}
          accent={t('ASSISTANT')}
          subtitle={t('Say what you want in Bangla or English.')}
          style={{ marginTop: 16 }}
        />

        {/* ---- the transcript ---- */}
        <View style={{ marginTop: 18, gap: 10 }}>
          {loading && !data ? (
            <Loading />
          ) : messages.length ? (
            <ScrollView
              ref={scroller}
              style={{ maxHeight: 320 }}
              contentContainerStyle={{ gap: 8, paddingVertical: 2 }}
              onContentSizeChange={() => scroller.current?.scrollToEnd({ animated: false })}
            >
              {messages.map((message) => (
                <View
                  key={message.id}
                  style={{
                    alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                    maxWidth: '86%',
                    backgroundColor:
                      message.role === 'user' ? `${colors.primary}18` : colors.surfaceSolid,
                    borderWidth: 1,
                    borderColor: message.role === 'user' ? `${colors.primary}33` : colors.line,
                    borderRadius: radius.md,
                    paddingVertical: 10,
                    paddingHorizontal: 13,
                    gap: 3,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      lineHeight: type.sm * 1.5,
                      color: colors.text,
                    }}
                  >
                    {message.text}
                  </Text>
                  <Text style={{ fontFamily: font.ui, fontSize: type.xs - 2, color: colors.textMuted }}>
                    {message.outcome === 'performed'
                      ? t('done')
                      : message.outcome === 'refused'
                        ? t('not done')
                        : message.outcome === 'proposed'
                          ? t('waiting for you')
                          : agoLabel(message.at, t)}
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <Panel style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                <Icon name="sparkles" size={18} color={colors.primary} />
                <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
                  {t('Try one of these')}
                </Text>
              </View>
              {EXAMPLES.map((example) => (
                <MiniButton
                  key={example}
                  label={example}
                  tone="plain"
                  onPress={() => ask(example)}
                  style={{ justifyContent: 'flex-start' }}
                />
              ))}
            </Panel>
          )}
        </View>

        {/* ---- the proposal, waiting on a person ---- */}
        {proposal ? (
          <Panel tone="warn" style={{ marginTop: 16, gap: 10 }}>
            <GroupLabel text={t('Confirm this')} />
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}>
              {proposal.reply}
            </Text>
            <View style={{ flexDirection: 'row', gap: 9 }}>
              <MiniButton
                label={t('Yes, do it')}
                icon="check"
                tone="good"
                onPress={confirm}
                disabled={busy}
                style={{ flex: 1 }}
              />
              <MiniButton
                label={t('Cancel')}
                icon="x"
                tone="plain"
                onPress={() => setProposal(null)}
                style={{ flex: 1 }}
              />
            </View>
            <Body muted style={{ fontSize: type.xs }}>
              {t('Nothing has changed yet. The assistant cannot record a meal on its own.')}
            </Body>
          </Panel>
        ) : null}

        {/* ---- the box ---- */}
        <View style={{ marginTop: 16, gap: 10, marginBottom: 8 }}>
          <Field
            value={text}
            onChangeText={setText}
            placeholder={t('e.g. turn my dinner off tomorrow')}
            multiline
            maxLength={500}
          />
          <Button label={t('Ask')} icon="arrowRight" onPress={() => ask()} disabled={busy || !text.trim()} block />

          <Panel style={{ gap: 6 }}>
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}>
              {t('What it can and cannot do')}
            </Text>
            <Body muted style={{ fontSize: type.xs }}>
              {t(
                'It can turn your own meals on and off and tell you where you stand. It cannot skip a cutoff, touch somebody else’s meals, approve money, or change anything without you confirming it first.',
              )}
            </Body>
          </Panel>
        </View>
      </Container>
    </Screen>
  );
}
