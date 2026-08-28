import React, { useCallback, useEffect } from 'react';
import { Pressable, RefreshControl, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import SectionHeader from '../../src/components/SectionHeader';
import Button from '../../src/components/Button';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useSession } from '../../src/store/SessionContext';
import { useChat } from '../../src/store/ChatContext';
import { useAuth } from '../../src/store/AuthContext';
import { timeAgo } from '../../src/store/OrdersContext';
import { useLang } from '../../src/i18n/LanguageContext';

/**
 * The inbox.
 *
 * Until this screen existed the only way anybody could reach anybody was the
 * `tel:` link on a cook's order screen — one direction, cook to customer,
 * nothing the other way and nothing at all to the platform. A customer whose
 * food never arrived had literally no one to tell.
 */
export default function ChatInbox() {
  const { colors, shadow } = useTheme();
  const router = useRouter();
  const { t, n } = useLang();
  const { isVerified, hydrated, hasServer } = useSession();
  const { isCookMode } = useAuth();
  const { threads, loading, connected, loadThreads, openThread, pendingCount } = useChat();

  useEffect(() => {
    if (isVerified) loadThreads();
  }, [isVerified, loadThreads]);

  const contactSupport = useCallback(async () => {
    try {
      const thread = await openThread({ kind: 'support' });
      if (thread) router.push(`/chat/${thread.id}`);
    } catch {
      /* the button stays; the next tap tries again */
    }
  }, [openThread, router]);

  if (!hydrated) return <Screen scroll={false} />;

  /* Chat is the one thing in this app that cannot work offline, so it says so
     rather than rendering an empty list that looks like "nobody has written". */
  if (!hasServer) {
    return (
      <Screen>
        <Container>
          <SectionHeader
            lead={t('NO')}
            accent={t('MESSAGES')}
            subtitle={t(
              'Chat is the one thing here that needs a server, and this build has no address for one.',
            )}
          />
        </Container>
      </Screen>
    );
  }

  if (!isVerified) {
    return (
      <Screen>
        <Container>
          <SectionHeader
            lead={t('VERIFY')}
            accent={t('YOUR NUMBER')}
            subtitle={t(
              'Messages go to a real person — your cook, or our support desk. One code, and you are in.',
            )}
            style={{ marginBottom: 22 }}
          />
          <Button
            label={t('Verify my number')}
            icon="phone"
            block
            onPress={() => router.push('/chat/verify')}
          />
        </Container>
      </Screen>
    );
  }

  return (
    <Screen
      refreshControl={
        <RefreshControl refreshing={loading} onRefresh={loadThreads} tintColor={colors.primary} />
      }
    >
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('MESSAGES')}
          subtitle={
            isCookMode
              ? t('Your customers, and our support desk.')
              : t('Your kitchen, and our support desk.')
          }
          style={{ marginBottom: 18 }}
        />

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 99,
              backgroundColor: connected ? colors.sage : colors.ink3,
            }}
          />
          <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.ink3 }}>
            {connected ? t('Connected') : t('Reconnecting…')}
            {pendingCount > 0
              ? ` · ${t('{n} waiting to send', { n: n(pendingCount) })}`
              : ''}
          </Text>
        </View>

        {threads.length === 0 ? (
          <View
            style={{
              backgroundColor: colors.raised,
              borderRadius: radius.md,
              borderWidth: 1,
              borderColor: colors.line,
              padding: 24,
              alignItems: 'center',
              gap: 10,
            }}
          >
            <Icon name="chefHat" size={26} color={colors.ink3} />
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: type.sm,
                color: colors.ink2,
                textAlign: 'center',
                lineHeight: 20,
              }}
            >
              {t('No messages yet. Start one from an order, or ask us anything.')}
            </Text>
          </View>
        ) : (
          <View style={{ gap: 10 }}>
            {threads.map((thread) => (
              <Pressable
                key={thread.id}
                onPress={() => router.push(`/chat/${thread.id}`)}
                style={({ pressed }) => [
                  {
                    backgroundColor: colors.raised,
                    borderRadius: radius.md,
                    borderWidth: 1,
                    borderColor: thread.unread > 0 ? colors.primary200 : colors.line,
                    padding: 14,
                    opacity: pressed ? 0.85 : 1,
                  },
                  shadow.xs,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: radius.pill,
                      backgroundColor:
                        thread.kind === 'support' ? colors.saffron50 : colors.primary50,
                    }}
                  >
                    <Text
                      style={{
                        fontFamily: font.uiSemi,
                        fontSize: type.micro,
                        color: thread.kind === 'support' ? colors.saffron : colors.primary,
                      }}
                    >
                      {thread.kind === 'support' ? t('Support') : t('Order')}
                    </Text>
                  </View>

                  <Text
                    numberOfLines={1}
                    style={{
                      flex: 1,
                      fontFamily: font.uiSemi,
                      fontSize: type.sm,
                      color: colors.ink,
                    }}
                  >
                    {thread.subject || thread.code}
                  </Text>

                  {thread.unread > 0 ? (
                    <View
                      style={{
                        minWidth: 19,
                        height: 19,
                        borderRadius: 99,
                        paddingHorizontal: 5,
                        backgroundColor: colors.primary,
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontFamily: font.uiBold,
                          fontSize: type.micro,
                          color: colors.onPrimary,
                        }}
                      >
                        {n(thread.unread)}
                      </Text>
                    </View>
                  ) : null}
                </View>

                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 5,
                    fontFamily: font.ui,
                    fontSize: type.xs + 1,
                    color: colors.ink2,
                  }}
                >
                  {thread.lastMessageBody || t('No messages yet')}
                </Text>

                <Text
                  style={{
                    marginTop: 3,
                    fontFamily: font.ui,
                    fontSize: type.micro,
                    color: colors.ink3,
                  }}
                >
                  {timeAgo(thread.lastMessageAt, t, n)}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <View style={{ marginTop: 22 }}>
          <Button
            label={t('Message support')}
            icon="sparkles"
            variant="ghost"
            block
            onPress={contactSupport}
          />
        </View>
      </Container>
    </Screen>
  );
}
