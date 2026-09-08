import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

import MessScreen, { useMessTopOffset } from '../../src/features/meal-management/MessScreen';
import Icon from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

import {
  Empty,
  Loading,
  MiniButton,
} from '../../src/features/meal-management/components';
import { useMealManagement } from '../../src/features/meal-management/store';
import { useMealAction } from '../../src/features/meal-management/errors';
import { agoLabel, dayLabel, todayKey } from '../../src/features/meal-management/format';

/**
 * The mess room. Everybody in the mess, one conversation.
 *
 * There are no direct messages, which is the point rather than a gap: a mess
 * is a handful of people sharing one set of books, and the conversation those
 * books depend on — who is shopping, why gas is up, are we settling Friday —
 * is exactly what must not happen in private pairs.
 *
 * It sits on the same socket the rest of the app uses. Nothing here opens a
 * connection; the store subscribes to the frames `ChatContext` already
 * receives, so a mess message arrives live without this feature knowing the
 * shop's chat exists.
 */
export default function MessRoom() {
  const router = useRouter();
  const { t } = useLang();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const topOffset = useMessTopOffset();
  const run = useMealAction();

  const {
    mess,
    messages,
    chatMeta,
    loadMessages,
    loadOlderMessages,
    postMessage,
    markChatRead,
    hideMessage,
  } = useMealManagement();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [busy, setBusy] = useState(false);
  const [olderBusy, setOlderBusy] = useState(false);

  const scroller = useRef(null);
  /* Only follow the conversation down when the reader is already at the
     bottom. Yanking somebody out of the message they are reading because
     three others arrived is the rudest thing a chat can do. */
  const atBottom = useRef(true);

  useFocusEffect(
    useCallback(() => {
      loadMessages({ force: true }).then(() => markChatRead());
    }, [loadMessages, markChatRead]),
  );

  /* Opening the room is reading it; so is a message arriving while it is open. */
  useEffect(() => {
    if (messages?.length) markChatRead();
  }, [messages?.length, markChatRead]);

  const send = async () => {
    const text = draft.trim();
    if (!text) return;

    setBusy(true);
    setDraft('');
    atBottom.current = true;
    Haptics.selectionAsync().catch(() => {});

    const out = await postMessage(text, { replyTo: replyTo ?? undefined });
    setBusy(false);
    setReplyTo(null);

    if (out && out.ok === false) {
      /* Put the words back rather than losing them to a failed send. */
      setDraft(text);
      run(() => Promise.resolve(out));
    }
  };

  const older = async () => {
    setOlderBusy(true);
    await loadOlderMessages();
    setOlderBusy(false);
  };

  /**
   * The list, with day separators and sender names only where they change.
   *
   * A name over every bubble in a run from the same person is noise; a name
   * over none of them makes a four-way conversation unreadable. So it appears
   * on the first of each run, which is how every readable chat does it.
   */
  const rows = useMemo(() => {
    const out = [];
    let lastDay = null;
    let lastSender = null;

    for (const message of messages ?? []) {
      const day = String(message.at ?? '').slice(0, 10);
      if (day && day !== lastDay) {
        out.push({ kind: 'day', key: `day-${day}`, day });
        lastDay = day;
        lastSender = null;
      }

      out.push({
        kind: 'message',
        key: message.id ?? message.clientId,
        message,
        showName: !message.mine && message.memberId !== lastSender,
      });
      lastSender = message.memberId;
    }

    return out;
  }, [messages]);

  return (
    <MessScreen scroll={false}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={insets.top}
      >
        <ScrollView
          ref={scroller}
          contentContainerStyle={{
            paddingTop: topOffset,
            paddingHorizontal: 14,
            paddingBottom: 16,
            gap: 6,
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          onScroll={(event) => {
            const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
            atBottom.current =
              contentOffset.y + layoutMeasurement.height >= contentSize.height - 60;
          }}
          scrollEventThrottle={64}
          onContentSizeChange={() => {
            if (atBottom.current) scroller.current?.scrollToEnd({ animated: false });
          }}
        >
          {messages === null ? (
            <Loading label={t('Opening the room…')} />
          ) : !rows.length ? (
            <View style={{ flex: 1, justifyContent: 'center' }}>
              <Empty
                icon="chat"
                title={t('Nothing said yet')}
                hint={t(
                  'This is the whole mess in one room — ask who is doing bazar, or why gas is up this month.',
                )}
              />
            </View>
          ) : (
            <>
              {chatMeta.hasMore ? (
                <View style={{ alignItems: 'center', paddingVertical: 8 }}>
                  <MiniButton
                    label={olderBusy ? t('Loading…') : t('Earlier messages')}
                    tone="plain"
                    onPress={older}
                    disabled={olderBusy}
                  />
                </View>
              ) : null}

              {rows.map((row) =>
                row.kind === 'day' ? (
                  <DaySeparator key={row.key} day={row.day} />
                ) : (
                  <Bubble
                    key={row.key}
                    message={row.message}
                    showName={row.showName}
                    canModerate={chatMeta.canModerate}
                    onReply={() => setReplyTo(row.message)}
                    onHide={() =>
                      run(() => hideMessage(row.message.id), t('Message removed.'))
                    }
                    onOpen={(about) => {
                      const href = linkFor(about);
                      if (href) router.push(href);
                    }}
                  />
                ),
              )}
            </>
          )}
        </ScrollView>

        {/* ---- the composer ---- */}
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.line,
            backgroundColor: colors.surfaceSolid,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: 10 + insets.bottom,
            gap: 8,
          }}
        >
          {replyTo ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingVertical: 8,
                paddingHorizontal: 11,
                borderRadius: radius.sm,
                backgroundColor: colors.sunken,
                borderLeftWidth: 3,
                borderLeftColor: colors.saffron,
              }}
            >
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.saffron }}
                >
                  {t('Replying to {name}', { name: replyTo.senderName || t('a message') })}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                >
                  {replyTo.body}
                </Text>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Cancel reply')}
                onPress={() => setReplyTo(null)}
                hitSlop={8}
              >
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 9 }}>
            <View
              style={{
                flex: 1,
                borderRadius: radius.md,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.canvas,
                paddingHorizontal: 13,
              }}
            >
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t('Message {mess}', { mess: mess?.name ?? t('the mess') })}
                placeholderTextColor={colors.textMuted}
                multiline
                maxLength={2000}
                style={{
                  paddingVertical: 11,
                  maxHeight: 120,
                  fontFamily: font.ui,
                  fontSize: type.sm + 1,
                  color: colors.text,
                }}
              />
            </View>

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Send')}
              accessibilityState={{ disabled: busy || !draft.trim() }}
              onPress={send}
              disabled={busy || !draft.trim()}
              style={({ pressed }) => ({
                width: 44,
                height: 44,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: draft.trim() ? colors.saffron : colors.sunken,
                opacity: pressed ? 0.8 : 1,
              })}
            >
              <Icon
                name="arrowRight"
                size={20}
                color={draft.trim() ? '#FFFFFF' : colors.textMuted}
                strokeWidth={2.2}
              />
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </MessScreen>
  );
}

/* ------------------------------------------------------------------ *
 * pieces
 * ------------------------------------------------------------------ */

/** Where a `{ kind, id }` reference leads. */
function linkFor(about) {
  if (!about?.kind) return null;
  switch (about.kind) {
    case 'bazar':
      return `/meal-management/bazar/${about.id}`;
    case 'expense':
      return '/meal-management/money/expenses';
    case 'deposit':
      return '/meal-management/money/deposits';
    case 'month':
      return '/meal-management/reports/settlement';
    case 'meal':
      return '/meal-management/meals/calendar';
    default:
      return null;
  }
}

function DaySeparator({ day }) {
  const { colors } = useTheme();
  const { t, lang } = useLang();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10 }}>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
      <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs - 1, color: colors.textMuted }}>
        {day === todayKey() ? t('Today') : dayLabel(day, lang)}
      </Text>
      <View style={{ flex: 1, height: 1, backgroundColor: colors.line }} />
    </View>
  );
}

/**
 * One message.
 *
 * Long-press opens what can be done to it, rather than a row of buttons under
 * every bubble — a conversation is read far more often than it is acted on.
 */
function Bubble({ message, showName, canModerate, onReply, onHide, onOpen }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const [open, setOpen] = useState(false);

  const mine = !!message.mine;

  if (message.hidden) {
    return (
      <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', paddingVertical: 4 }}>
        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.xs,
            fontStyle: 'italic',
            color: colors.textMuted,
          }}
        >
          {t('Message removed')}
        </Text>
      </View>
    );
  }

  return (
    <View style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '86%', gap: 3 }}>
      {showName ? (
        <Text
          style={{
            marginLeft: 4,
            fontFamily: font.uiSemi,
            fontSize: type.xs - 1,
            color: colors.saffron,
          }}
        >
          {message.senderName}
        </Text>
      ) : null}

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${message.senderName || t('You')}: ${message.body}`}
        onLongPress={() => {
          Haptics.selectionAsync().catch(() => {});
          setOpen((was) => !was);
        }}
        style={({ pressed }) => ({
          borderRadius: radius.md,
          paddingVertical: 9,
          paddingHorizontal: 13,
          backgroundColor: mine ? `${colors.saffron}22` : colors.surfaceSolid,
          borderWidth: 1,
          borderColor: mine ? `${colors.saffron}44` : colors.line,
          opacity: pressed ? 0.85 : message.sending ? 0.6 : 1,
          gap: 6,
        })}
      >
        {message.replyToBody ? (
          <View
            style={{
              borderLeftWidth: 2,
              borderLeftColor: colors.saffron,
              paddingLeft: 8,
              gap: 1,
            }}
          >
            <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs - 1, color: colors.saffron }}>
              {message.replyToName}
            </Text>
            <Text
              numberOfLines={2}
              style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
            >
              {message.replyToBody}
            </Text>
          </View>
        ) : null}

        <Text
          style={{
            fontFamily: font.ui,
            fontSize: type.sm + 1,
            lineHeight: (type.sm + 1) * 1.45,
            color: colors.text,
          }}
        >
          {message.body}
        </Text>

        {message.about ? (
          <Pressable
            accessibilityRole="link"
            onPress={() => onOpen(message.about)}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 7,
              marginTop: 2,
              paddingVertical: 7,
              paddingHorizontal: 9,
              borderRadius: radius.sm,
              backgroundColor: colors.sunken,
              opacity: pressed ? 0.75 : 1,
            })}
          >
            <Icon name="receipt" size={14} color={colors.saffron} />
            <Text
              numberOfLines={1}
              style={{ flex: 1, fontFamily: font.uiSemi, fontSize: type.xs, color: colors.text }}
            >
              {message.about.label || t('Open')}
            </Text>
            <Icon name="chevronRight" size={13} color={colors.textMuted} />
          </Pressable>
        ) : null}

        <Text
          style={{
            alignSelf: 'flex-end',
            fontFamily: font.ui,
            fontSize: type.xs - 2,
            color: colors.textMuted,
          }}
        >
          {message.sending ? t('sending…') : agoLabel(message.at, t)}
        </Text>
      </Pressable>

      {open ? (
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
          <MiniButton
            label={t('Reply')}
            icon="chat"
            tone="plain"
            onPress={() => {
              setOpen(false);
              onReply();
            }}
          />
          {mine || canModerate ? (
            <MiniButton
              label={t('Remove')}
              icon="x"
              tone="bad"
              onPress={() => {
                setOpen(false);
                onHide();
              }}
            />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
