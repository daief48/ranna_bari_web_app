import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import MessScreen, { Container } from '../../../src/features/meal-management/MessScreen';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import Icon from '../../../src/components/Icon';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, type } from '../../../src/theme/tokens';
import { useLang } from '../../../src/i18n/LanguageContext';

import {
  BackLink,
  Chip,
  ChipRow,
  Divider,
  Empty,
  Field,
  GroupLabel,
  Loading,
  Meter,
  MiniButton,
  Panel,
  Sheet,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import { agoLabel, shiftDay, todayKey } from '../../../src/features/meal-management/format';

/**
 * Polls. §4.12.
 *
 * Tomorrow's menu, a new cook, the bazar budget — the decisions a mess makes
 * by arguing in a group chat until somebody gives up. A poll makes the same
 * decision in a way that can be counted.
 *
 * A poll set to hide its results until it closes really does hide them, which
 * is the point of the option: early votes steering later ones is exactly what
 * a secret ballot exists to prevent.
 */
export default function Polls() {
  const { t, n } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { can, createPoll, votePoll, closePoll, removePoll, load } = useMealManagement();
  const { data, loading } = useSlice('polls');

  const [creating, setCreating] = useState(false);

  useFocusEffect(
    useCallback(() => {
      load.polls({ force: true });
    }, [load]),
  );

  const polls = data?.polls ?? [];
  const manage = can('manage_polls');

  const cast = (poll, optionId) => {
    const already = poll.myVote ?? [];
    const next = poll.multi
      ? already.includes(optionId)
        ? already.filter((id) => id !== optionId)
        : [...already, optionId]
      : [optionId];

    if (!next.length) return;
    run(() => votePoll(poll.id, next), t('Vote recorded.'));
  };

  return (
    <MessScreen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('THE')}
          accent={t('POLLS')}
          subtitle={t('Decide it by counting rather than by arguing.')}
          style={{ marginTop: 16 }}
        />

        {manage ? (
          <View style={{ marginTop: 18 }}>
            <Button label={t('Start a poll')} icon="plus" onPress={() => setCreating(true)} block />
          </View>
        ) : null}

        {loading && !data ? (
          <Loading />
        ) : !polls.length ? (
          <View style={{ marginTop: 18 }}>
            <Empty
              icon="check"
              title={t('No polls yet')}
              hint={t('Ask the mess what to cook on Friday, or who the next cook should be.')}
            />
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 12, marginBottom: 8 }}>
            {polls.map((poll) => {
              const total = poll.totalVotes;
              const peak = Math.max(1, ...poll.options.map((option) => option.votes ?? 0));
              const hidden = poll.options.some((option) => option.votes === null);

              return (
                <Panel key={poll.id} tone={poll.open ? undefined : 'warn'} style={{ gap: 10 }}>
                  <View style={{ gap: 3 }}>
                    <Text style={{ fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}>
                      {poll.question}
                    </Text>
                    <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
                      {poll.author} · {agoLabel(poll.at, t)}
                      {poll.open ? '' : ` · ${t('closed')}`}
                      {poll.multi ? ` · ${t('pick more than one')}` : ''}
                    </Text>
                  </View>

                  <Divider />

                  {poll.options.map((option) => {
                    const chosen = (poll.myVote ?? []).includes(option.id);
                    return (
                      <Pressable
                        key={option.id}
                        accessibilityRole="button"
                        accessibilityState={{ selected: chosen, disabled: !poll.open }}
                        onPress={poll.open ? () => cast(poll, option.id) : undefined}
                        style={({ pressed }) => ({ gap: 5, opacity: pressed ? 0.75 : 1 })}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}>
                          <View
                            style={{
                              width: 20,
                              height: 20,
                              borderRadius: poll.multi ? 6 : 10,
                              borderWidth: 1.5,
                              borderColor: chosen ? colors.sage : colors.line,
                              backgroundColor: chosen ? colors.sage : 'transparent',
                              alignItems: 'center',
                              justifyContent: 'center',
                            }}
                          >
                            {chosen ? <Icon name="check" size={12} color="#FFFFFF" /> : null}
                          </View>

                          <Text
                            style={{
                              flex: 1,
                              fontFamily: chosen ? font.uiSemi : font.ui,
                              fontSize: type.sm,
                              color: colors.text,
                            }}
                          >
                            {option.text}
                          </Text>

                          {option.votes !== null ? (
                            <Text
                              style={{
                                fontFamily: font.uiSemi,
                                fontSize: type.xs,
                                color: colors.textMuted,
                                fontVariant: ['tabular-nums'],
                              }}
                            >
                              {n(option.votes)}
                            </Text>
                          ) : null}
                        </View>

                        {option.votes !== null ? (
                          <Meter
                            value={option.votes}
                            max={peak}
                            tone={chosen ? 'good' : 'warn'}
                            style={{ marginLeft: 29 }}
                          />
                        ) : null}
                      </Pressable>
                    );
                  })}

                  {hidden ? (
                    <Body muted style={{ fontSize: type.xs }}>
                      {t('Results appear once the poll closes.')}
                    </Body>
                  ) : total !== null ? (
                    <Body muted style={{ fontSize: type.xs }}>
                      {t('{n} votes so far', { n: n(total) })}
                    </Body>
                  ) : null}

                  {manage ? (
                    <ChipRow>
                      {poll.open ? (
                        <Chip
                          label={t('Close it')}
                          tone="warn"
                          onPress={() => run(() => closePoll(poll.id), t('Poll closed.'))}
                        />
                      ) : null}
                      <Chip
                        label={t('Delete')}
                        tone="bad"
                        onPress={() => run(() => removePoll(poll.id), t('Deleted.'))}
                      />
                    </ChipRow>
                  ) : null}
                </Panel>
              );
            })}
          </View>
        )}
      </Container>

      <PollSheet
        open={creating}
        onClose={() => setCreating(false)}
        onSubmit={async (body) => {
          const out = await run(() => createPoll(body), t('Poll started.'));
          if (out?.ok) setCreating(false);
          return out;
        }}
      />
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * starting one
 * ------------------------------------------------------------------ */

function PollSheet({ open, onClose, onSubmit }) {
  const { t } = useLang();
  const { colors } = useTheme();

  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [multi, setMulti] = useState(false);
  const [visibility, setVisibility] = useState('live');
  const [endAt, setEndAt] = useState('');
  const [busy, setBusy] = useState(false);

  const usable = options.map((option) => option.trim()).filter(Boolean);

  const submit = async () => {
    setBusy(true);
    await onSubmit({
      question: question.trim(),
      options: usable,
      multi,
      resultVisibility: visibility,
      endAt: endAt.trim() || null,
    });
    setBusy(false);
    setQuestion('');
    setOptions(['', '']);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('Start a poll')}
      footer={
        <Button
          label={t('Start it')}
          onPress={submit}
          disabled={busy || !question.trim() || usable.length < 2}
          block
        />
      }
    >
      <Field
        label={t('Question')}
        value={question}
        onChangeText={setQuestion}
        placeholder={t('e.g. What should we cook on Friday?')}
        maxLength={280}
      />

      <View style={{ gap: 9 }}>
        <GroupLabel
          text={t('Options')}
          right={
            options.length < 12 ? (
              <MiniButton
                label={t('Add')}
                icon="plus"
                tone="plain"
                onPress={() => setOptions((prev) => [...prev, ''])}
              />
            ) : null
          }
        />

        {options.map((option, index) => (
          <View
            // eslint-disable-next-line react/no-array-index-key
            key={index}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
          >
            <Field
              value={option}
              onChangeText={(value) =>
                setOptions((prev) => prev.map((item, i) => (i === index ? value : item)))
              }
              placeholder={t('Option {n}', { n: index + 1 })}
              style={{ flex: 1 }}
              maxLength={120}
            />
            {options.length > 2 ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Remove option')}
                onPress={() => setOptions((prev) => prev.filter((_, i) => i !== index))}
                hitSlop={8}
                style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1, padding: 4 })}
              >
                <Icon name="x" size={17} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>
        ))}
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('How people vote')} />
        <ChipRow>
          <Chip label={t('One choice')} active={!multi} onPress={() => setMulti(false)} />
          <Chip label={t('Several choices')} active={multi} onPress={() => setMulti(true)} />
        </ChipRow>
      </View>

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('Results')} />
        <ChipRow>
          <Chip
            label={t('Visible while voting')}
            active={visibility === 'live'}
            onPress={() => setVisibility('live')}
          />
          <Chip
            label={t('Hidden until it closes')}
            active={visibility === 'final'}
            onPress={() => setVisibility('final')}
          />
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {t('Hiding them stops early votes from steering the later ones.')}
        </Body>
      </View>

      <Field
        label={t('Closes on (optional)')}
        value={endAt}
        onChangeText={setEndAt}
        placeholder={shiftDay(todayKey(), 2)}
      />
    </Sheet>
  );
}
