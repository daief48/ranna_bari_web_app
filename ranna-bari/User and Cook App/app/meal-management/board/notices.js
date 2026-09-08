import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';

import Screen, { Container } from '../../../src/components/Screen';
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
  Empty,
  Field,
  GroupLabel,
  Loading,
  Panel,
  Sheet,
} from '../../../src/features/meal-management/components';
import { useMealManagement, useSlice } from '../../../src/features/meal-management/store';
import { useMealAction } from '../../../src/features/meal-management/errors';
import { agoLabel, shiftDay, todayKey } from '../../../src/features/meal-management/format';

/**
 * The notice board. §4.11.
 *
 * Announcements everybody should see, with read state per member so an admin
 * can tell whether the message about tomorrow's lunch actually landed.
 *
 * Opening a notice marks it read. That is the whole interaction — a separate
 * "mark as read" is a button people press to make a badge go away rather than
 * because they read anything.
 */
export default function Notices() {
  const { t, n } = useLang();
  const { colors } = useTheme();
  const run = useMealAction();

  const { can, saveNotice, readNotice, removeNotice, load } = useMealManagement();
  const { data, loading } = useSlice('notices');

  const [editing, setEditing] = useState(null);
  const [open, setOpen] = useState(null);

  useFocusEffect(
    useCallback(() => {
      load.notices({ force: true });
    }, [load]),
  );

  const notices = data?.notices ?? [];
  const manage = can('manage_notices');

  const openNotice = (notice) => {
    setOpen(open === notice.id ? null : notice.id);
    if (!notice.read) run(() => readNotice(notice.id));
  };

  return (
    <Screen>
      <Container>
        <BackLink fallback="/meal-management/more" />

        <SectionHeader
          lead={t('NOTICE')}
          accent={t('BOARD')}
          subtitle={t('Announcements from the mess.')}
          style={{ marginTop: 16 }}
        />

        {manage ? (
          <View style={{ marginTop: 18 }}>
            <Button
              label={t('Post a notice')}
              icon="plus"
              onPress={() => setEditing({})}
              block
            />
          </View>
        ) : null}

        {loading && !data ? (
          <Loading />
        ) : !notices.length ? (
          <View style={{ marginTop: 18 }}>
            <Empty
              icon="bell"
              title={t('Nothing on the board')}
              hint={t('An admin posts here when everybody needs to know something.')}
            />
          </View>
        ) : (
          <View style={{ marginTop: 18, gap: 10, marginBottom: 8 }}>
            {data.unread ? (
              <GroupLabel text={t('{n} unread', { n: n(data.unread) })} />
            ) : (
              <GroupLabel text={t('All caught up')} />
            )}

            {notices.map((notice) => (
              <Pressable
                key={notice.id}
                accessibilityRole="button"
                onPress={() => openNotice(notice)}
                style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
              >
                <Panel tone={notice.important ? 'bad' : notice.pinned ? 'warn' : undefined} style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 9 }}>
                    {!notice.read ? (
                      <View
                        style={{
                          width: 7,
                          height: 7,
                          borderRadius: 4,
                          marginTop: 6,
                          backgroundColor: colors.primary,
                        }}
                      />
                    ) : null}

                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text
                        style={{
                          fontFamily: notice.read ? font.uiSemi : font.uiBold,
                          fontSize: type.sm + 1,
                          color: colors.text,
                        }}
                      >
                        {notice.title}
                      </Text>
                      <Text
                        style={{
                          marginTop: 2,
                          fontFamily: font.ui,
                          fontSize: type.xs,
                          color: colors.textMuted,
                        }}
                      >
                        {notice.author} · {agoLabel(notice.at, t)}
                      </Text>
                    </View>

                    {notice.pinned ? <Icon name="pin" size={15} color={colors.saffron} /> : null}
                  </View>

                  {open === notice.id && notice.body ? (
                    <Text
                      style={{
                        fontFamily: font.ui,
                        fontSize: type.sm,
                        lineHeight: type.sm * 1.55,
                        color: colors.text,
                      }}
                    >
                      {notice.body}
                    </Text>
                  ) : notice.body ? (
                    <Body muted style={{ fontSize: type.xs }} numberOfLines={2}>
                      {notice.body}
                    </Body>
                  ) : null}

                  {open === notice.id && manage ? (
                    <ChipRow>
                      <Chip label={t('Edit')} onPress={() => setEditing(notice)} />
                      <Chip
                        label={t('Remove')}
                        tone="bad"
                        onPress={() => run(() => removeNotice(notice.id), t('Removed.'))}
                      />
                    </ChipRow>
                  ) : null}
                </Panel>
              </Pressable>
            ))}
          </View>
        )}
      </Container>

      <NoticeSheet
        notice={editing}
        onClose={() => setEditing(null)}
        onSave={async (body) => {
          const out = await run(() => saveNotice(body), t('Posted.'));
          if (out?.ok) setEditing(null);
          return out;
        }}
      />
    </Screen>
  );
}

/* ------------------------------------------------------------------ *
 * writing one
 * ------------------------------------------------------------------ */

function NoticeSheet({ notice, onClose, onSave }) {
  const { t } = useLang();

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [pinned, setPinned] = useState(false);
  const [important, setImportant] = useState(false);
  const [expires, setExpires] = useState('');
  const [busy, setBusy] = useState(false);

  React.useEffect(() => {
    setTitle(notice?.title ?? '');
    setBody(notice?.body ?? '');
    setPinned(!!notice?.pinned);
    setImportant(!!notice?.important);
    setExpires('');
  }, [notice]);

  if (!notice) return null;

  const save = async () => {
    setBusy(true);
    await onSave({
      id: notice.id,
      title: title.trim(),
      body: body.trim() || undefined,
      pinned,
      important,
      expiresAt: expires.trim() || null,
    });
    setBusy(false);
  };

  return (
    <Sheet
      open={!!notice}
      onClose={onClose}
      title={notice.id ? t('Edit the notice') : t('Post a notice')}
      footer={<Button label={t('Post it')} onPress={save} disabled={busy || !title.trim()} block />}
    >
      <Field
        label={t('Title')}
        value={title}
        onChangeText={setTitle}
        placeholder={t('e.g. Turn tomorrow’s lunch off by 8am')}
        maxLength={140}
      />

      <Field
        label={t('Message')}
        value={body}
        onChangeText={setBody}
        multiline
        maxLength={4000}
      />

      <View style={{ gap: 8 }}>
        <GroupLabel text={t('How it appears')} />
        <ChipRow>
          <Chip
            label={t('Pinned to the top')}
            active={pinned}
            tone="warn"
            onPress={() => setPinned(!pinned)}
          />
          <Chip
            label={t('Important')}
            active={important}
            tone="bad"
            onPress={() => setImportant(!important)}
          />
        </ChipRow>
        <Body muted style={{ fontSize: 12 }}>
          {t('Everybody gets a notification either way. Important marks it in the message too.')}
        </Body>
      </View>

      <Field
        label={t('Expires on (optional)')}
        value={expires}
        onChangeText={setExpires}
        placeholder={shiftDay(todayKey(), 7)}
        hint={t('After this day it drops off the board on its own.')}
      />
    </Sheet>
  );
}
