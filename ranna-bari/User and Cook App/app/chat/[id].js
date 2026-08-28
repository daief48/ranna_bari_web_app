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
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import Icon from '../../src/components/Icon';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useChat } from '../../src/store/ChatContext';
import { timeAgo } from '../../src/store/OrdersContext';
import { useLang } from '../../src/i18n/LanguageContext';

/**
 * One conversation.
 *
 * Not built on `Screen`: a chat wants the composer pinned to the keyboard and
 * the transcript scrolled to the bottom, and the standard page shell is built
 * for a document that scrolls under a floating bar. This is the one screen in
 * the app where that shape is wrong.
 */
export default function ChatThread() {
  const { id } = useLocalSearchParams();
  const threadId = String(id);

  const { colors, shadow } = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { t, n } = useLang();
  const { identity } = useSession();
  const { threads, messages, connected, loadMessages, setActive, send } = useChat();

  const [draft, setDraft] = useState('');
  const scrollRef = useRef(null);

  const thread = useMemo(() => threads.find((x) => x.id === threadId), [threads, threadId]);
  const list = messages[threadId] ?? [];

  useEffect(() => {
    loadMessages(threadId);
    setActive(threadId);
    return () => setActive(null);
  }, [threadId, loadMessages, setActive]);

  // Follow the conversation down as it grows.
  useEffect(() => {
    const timer = setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 60);
    return () => clearTimeout(timer);
  }, [list.length]);

  const submit = useCallback(() => {
    const text = draft.trim();
    if (!text) return;
    setDraft('');
    send(threadId, text);
  }, [draft, send, threadId]);

  /**
   * Whose message is this?
   *
   * The server labels a message by *role* — customer, cook, admin — because
   * it has no idea which device is reading it. Turning that into "mine"
   * happens here, where the session knows who this is. A cook and a customer
   * looking at the same thread should each see their own words on the right.
   */
  const isMine = useCallback(
    (message) => {
      if (message.senderType === 'me') return true; // optimistic, not yet stored
      if (!identity) return false;
      if (identity.kitchenId) return message.senderType === 'cook';
      return message.senderType === 'customer';
    },
    [identity],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.canvas }}>
      {/* header */}
      <View
        style={[
          {
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            paddingHorizontal: 16,
            backgroundColor: colors.raised,
            borderBottomWidth: 1,
            borderBottomColor: colors.line,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
          },
          shadow.xs,
        ]}
      >
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('Back')}
        >
          <Icon name="arrowLeft" size={20} color={colors.ink} />
        </Pressable>

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.displaySemi, fontSize: type.h3 - 2, color: colors.ink }}
          >
            {thread?.subject || t('Conversation')}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 1 }}>
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 99,
                backgroundColor: connected ? colors.sage : colors.ink3,
              }}
            />
            <Text style={{ fontFamily: font.ui, fontSize: type.micro, color: colors.ink3 }}>
              {connected ? t('Connected') : t('Reconnecting…')}
            </Text>
          </View>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={0}
      >
        <ScrollView
          ref={scrollRef}
          contentContainerStyle={{ padding: 16, gap: 10, paddingBottom: 20 }}
          keyboardShouldPersistTaps="handled"
        >
          {list.length === 0 ? (
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.sm,
                color: colors.ink3,
                textAlign: 'center',
                marginTop: 40,
              }}
            >
              {t('No messages yet. Say hello.')}
            </Text>
          ) : null}

          {list.map((message) => {
            if (message.senderType === 'system') {
              return (
                <Text
                  key={message.id}
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.micro,
                    color: colors.ink3,
                    textAlign: 'center',
                    marginVertical: 4,
                  }}
                >
                  {message.body}
                </Text>
              );
            }

            const mine = isMine(message);

            return (
              <View
                key={message.id}
                style={{ alignItems: mine ? 'flex-end' : 'flex-start' }}
              >
                {!mine ? (
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.micro,
                      color: colors.ink3,
                      marginBottom: 3,
                      marginLeft: 4,
                    }}
                  >
                    {message.senderType === 'admin'
                      ? t('Support')
                      : message.senderName || t('Kitchen')}
                  </Text>
                ) : null}

                <View
                  style={{
                    maxWidth: '82%',
                    paddingHorizontal: 13,
                    paddingVertical: 9,
                    borderRadius: radius.md,
                    backgroundColor: mine ? colors.primary : colors.raised,
                    borderWidth: mine ? 0 : 1,
                    borderColor: colors.line,
                    // A message still in the outbox is dimmed rather than
                    // hidden: it exists, it just has not left yet.
                    opacity: message.pending ? 0.6 : 1,
                  }}
                >
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.sm,
                      lineHeight: 20,
                      color: mine ? colors.onPrimary : colors.ink,
                    }}
                  >
                    {message.body}
                  </Text>
                </View>

                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.micro,
                    color: message.failed ? colors.primary : colors.ink3,
                    marginTop: 3,
                    marginHorizontal: 4,
                  }}
                >
                  {message.failed
                    ? t('Not sent')
                    : message.pending
                      ? t('Sending…')
                      : timeAgo(message.sentAt, t, n)}
                </Text>
              </View>
            );
          })}
        </ScrollView>

        {/* composer */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-end',
            gap: 8,
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: Math.max(insets.bottom, 10),
            backgroundColor: colors.raised,
            borderTopWidth: 1,
            borderTopColor: colors.line,
          }}
        >
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={t('Write a message')}
            placeholderTextColor={colors.ink3}
            multiline
            style={{
              flex: 1,
              maxHeight: 110,
              minHeight: 40,
              paddingHorizontal: 14,
              paddingTop: 10,
              paddingBottom: 10,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.line,
              backgroundColor: colors.canvas,
              fontFamily: font.ui,
              fontSize: type.sm,
              color: colors.ink,
            }}
          />

          <Pressable
            onPress={submit}
            disabled={!draft.trim()}
            accessibilityRole="button"
            accessibilityLabel={t('Send')}
            style={({ pressed }) => [
              {
                width: 40,
                height: 40,
                borderRadius: 99,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: draft.trim() ? colors.primary : colors.sunken,
                opacity: pressed ? 0.85 : 1,
              },
              draft.trim() ? shadow.primary : null,
            ]}
          >
            <Icon
              name="arrowRight"
              size={18}
              color={draft.trim() ? colors.onPrimary : colors.ink3}
            />
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}
