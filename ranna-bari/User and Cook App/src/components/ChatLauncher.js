import React, { useCallback, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useSession } from '../store/SessionContext';
import { useChat } from '../store/ChatContext';
import { useSync } from '../store/SyncContext';
import { hasServer } from '../lib/server';
import { useLang } from '../i18n/LanguageContext';

/**
 * "Message the kitchen" — the button that closes the oldest hole in the app.
 *
 * Until this existed a cook could ring a customer and a customer could reach
 * nobody at all: the order screen showed the customer their *own* phone
 * number, and there was no path back the other way.
 *
 * It handles the three states honestly rather than pretending: no server
 * configured, not verified yet, and ready. A button that opens a dead screen
 * is worse than a button that says why it cannot.
 */
export default function ChatLauncher({
  /** `{ kind: 'order', orderId }` or `{ kind: 'request', requestId, kitchenId }` */
  spec,
  label,
  compact,
}) {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t } = useLang();
  const { isVerified } = useSession();
  const { openThread } = useChat();
  const { serverOrderId } = useSync();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  const go = useCallback(async () => {
    if (!isVerified) {
      router.push('/chat/verify');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      let resolved = spec;

      /* An order lives on the device, and the server knows it by a different
         id — or not at all, if it has not been mirrored up yet. Ask for the
         server's id, syncing if that is what it takes, rather than posting a
         local code the server will rightly refuse. */
      if (spec.kind === 'order') {
        const serverId = await serverOrderId(spec.orderId);
        if (!serverId) {
          setNote(
            t('This order has not reached the server yet. Try again in a moment.'),
          );
          return;
        }
        resolved = { ...spec, orderId: serverId };
      }

      const thread = await openThread(resolved);
      if (thread) router.push(`/chat/${thread.id}`);
    } catch (error) {
      setNote(error?.message ?? t('Could not open the conversation.'));
    } finally {
      setBusy(false);
    }
  }, [isVerified, openThread, serverOrderId, spec, router, t]);

  // Nothing to connect to. Say so instead of offering a button that cannot work.
  if (!hasServer) return null;

  return (
    <View>
      <Pressable
        onPress={go}
        disabled={busy}
        accessibilityRole="button"
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingVertical: compact ? 10 : 13,
            paddingHorizontal: 18,
            borderRadius: radius.pill,
            borderWidth: 1,
            borderColor: colors.primary200,
            backgroundColor: colors.primary50,
            opacity: pressed || busy ? 0.8 : 1,
          },
          shadow.xs,
        ]}
      >
        <Icon name="chefHat" size={16} color={colors.primary} />
        <Text
          style={{
            fontFamily: font.uiSemi,
            fontSize: compact ? type.xs + 1 : type.sm,
            color: colors.primary,
          }}
        >
          {busy ? t('Opening…') : label || t('Message the kitchen')}
        </Text>
      </Pressable>

      {!isVerified ? (
        <Text
          style={{
            marginTop: 6,
            fontFamily: font.ui,
            fontSize: type.micro,
            color: colors.ink3,
            textAlign: 'center',
          }}
        >
          {t('Takes one code to verify your number.')}
        </Text>
      ) : null}

      {note ? (
        <Text
          style={{
            marginTop: 6,
            fontFamily: font.ui,
            fontSize: type.micro,
            color: colors.primary,
            textAlign: 'center',
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
