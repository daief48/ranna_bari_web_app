/**
 * The kitchen's public identity, its verification, and its money — one page.
 *
 * Business used to be four rows of links to places that held the actual
 * information, and the account sat on a third screen entirely. A cook who
 * wanted to answer "who am I on this app, am I verified, and what am I owed"
 * had to visit four screens to assemble it. Everything here is a surface, not
 * a link: each block shows its live state, and the link is how you change it.
 *
 * Money leads after identity, because it is the reason the rest of it exists.
 */
import React, { useState } from 'react';
import { Image, Pressable, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { ActionRow, KycBanner } from '../../../src/components/CookBits';
import { IconTile } from '../../../src/components/Surfaces';
import { Body, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useAuth } from '../../../src/store/AuthContext';
import { useSession } from '../../../src/store/SessionContext';
import { useCookPayouts } from '../../../src/data/cook';
import { formatOrderDate } from '../../../src/store/OrdersContext';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function CookProfile() {
  const { colors, shadow } = useTheme();
  const { t, n, lang } = useLang();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const meals = useCommerce();
  const { account, setViewMode, signOut } = useAuth();
  const { signOutServer } = useSession();
  const { payouts } = useCookPayouts();

  const [confirmOut, setConfirmOut] = useState(false);

  const contact = account?.email || account?.phone || '';

  /* How verification reads as a badge — the same three states the dashboard
     tile shows, in the words this page can spend a little more room on. */
  const kyc = kitchen?.kycStatus;
  const kycBadge =
    kyc === 'approved'
      ? { icon: 'shieldCheck', fg: colors.sage, bg: colors.sage50, label: t('Verified kitchen') }
      : kyc === 'rejected'
        ? {
            icon: 'alertCircle',
            fg: colors.primary,
            bg: colors.primary50,
            label: t('Verification failed'),
          }
        : { icon: 'clock', fg: colors.saffron, bg: colors.saffron50, label: t('Verification pending') };

  /* The last payout an operator actually marked paid — not the balance,
     which is "owed", and not a delivered order, which is "in the queue". */
  const lastPayout = payouts[0] ?? null;

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('PROFILE')}
          subtitle={t('How customers see you, what the platform knows, and what you are owed.')}
          style={{ marginBottom: 22 }}
        />

        {/* ---- The kitchen, as a customer meets it ----
            Drawn the way the listing card draws it — same photograph, same
            name, same score line — so this is a preview that happens to have
            an Edit button on it, not a form. */}
        <Reveal delay={1}>
          <View
            style={[
              {
                borderRadius: 28,
                overflow: 'hidden',
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
              },
              shadow.md,
            ]}
          >
            <View style={{ height: 118 }}>
              <Image
                source={kitchen?.coverImage ? { uri: kitchen.coverImage } : null}
                contentFit="cover"
                transition={200}
                style={{ width: '100%', height: '100%', backgroundColor: colors.sunken }}
              />
              <LinearGradient
                colors={['transparent', `rgba(${colors.scrim}, 0.55)`]}
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
              />
            </View>

            <View style={{ paddingHorizontal: 18, paddingBottom: 18 }}>
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-end',
                  gap: 14,
                  marginTop: -28,
                }}
              >
                <Image
                  source={kitchen?.avatar ? { uri: kitchen.avatar } : null}
                  contentFit="cover"
                  transition={200}
                  style={{
                    width: 72,
                    height: 72,
                    borderRadius: 24,
                    borderWidth: 3,
                    borderColor: colors.surfaceSolid,
                    backgroundColor: colors.sunken,
                  }}
                />

                <View style={{ flex: 1, minWidth: 0, paddingBottom: 4 }}>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.displayExtra,
                      fontSize: 20,
                      letterSpacing: -0.4,
                      color: colors.text,
                    }}
                  >
                    {kitchen?.name ?? t('Your kitchen')}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.textMuted,
                    }}
                  >
                    {kitchen?.specialty} · {kitchen?.area}
                  </Text>
                </View>
              </View>

              {/* The line a customer scans: score, volume, and whether the
                  kitchen is taking orders right now. A kitchen with no
                  reviews shows a dash rather than a fabricated 5.0. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  marginTop: 14,
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: radius.md,
                  backgroundColor: colors.sunken,
                  borderWidth: 1,
                  borderColor: colors.line2,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                  <Icon name="star" size={14} color={colors.saffron} strokeWidth={2.6} />
                  <Text
                    style={{
                      fontFamily: font.uiBold,
                      fontSize: 14,
                      color: colors.text,
                      fontVariant: ['tabular-nums'],
                    }}
                  >
                    {kitchen?.reviewCount ? n(Number(kitchen.rating ?? 0).toFixed(1)) : '—'}
                  </Text>
                </View>
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    color: colors.textMuted,
                  }}
                >
                  {kitchen?.reviewCount
                    ? t('{n} reviews', { n: n(kitchen.reviewCount) })
                    : t('No reviews yet')}
                </Text>
                <View style={{ flex: 1 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View
                    style={{
                      width: 7,
                      height: 7,
                      borderRadius: 4,
                      backgroundColor: kitchen?.isOpen ? colors.sage : colors.textLight,
                    }}
                  />
                  <Text
                    style={{
                      fontFamily: font.uiSemi,
                      fontSize: type.xs,
                      color: kitchen?.isOpen ? colors.sage : colors.textMuted,
                    }}
                  >
                    {kitchen?.isOpen ? t('Open') : t('Closed')}
                  </Text>
                </View>
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 14 }}>
                <Button
                  label={t('Edit')}
                  icon="sliders"
                  small
                  style={{ flex: 1 }}
                  disabled={!kitchen}
                  onPress={() => router.push('/cook/kitchen-details')}
                />
                <Button
                  variant="glass"
                  label={t('Preview')}
                  icon="eye"
                  small
                  style={{ flex: 1 }}
                  disabled={!kitchen}
                  onPress={() => router.push(`/chef/${kitchen?.id}`)}
                />
              </View>
            </View>
          </View>
        </Reveal>

        {/* ---- Verification ----
            The banner says what the state means; the badge above repeats it
            in one word for the cook who has read it before. */}
        <Reveal delay={2}>
          <View style={{ marginTop: 16 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginBottom: 10,
              }}
            >
              <Icon name={kycBadge.icon} size={15} color={kycBadge.fg} />
              <Text
                style={{
                  paddingVertical: 4,
                  paddingHorizontal: 10,
                  borderRadius: radius.pill,
                  backgroundColor: kycBadge.bg,
                  fontFamily: font.uiBold,
                  fontSize: 9.5,
                  letterSpacing: 0.7,
                  textTransform: 'uppercase',
                  color: kycBadge.fg,
                }}
              >
                {kycBadge.label}
              </Text>
            </View>

            <KycBanner
              status={kyc}
              note={kitchen?.kycNote}
              onContact={() => router.push('/chat')}
            />

            {kyc !== 'approved' ? (
              <ActionRow
                icon="shieldCheck"
                tone={kyc === 'rejected' ? 'primary' : 'saffron'}
                style={{ marginTop: 12 }}
                title={
                  kitchen?.documentsSubmittedAt == null
                    ? t('Send your documents')
                    : t('Your documents')
                }
                sub={
                  kitchen?.documentsSubmittedAt == null
                    ? t('NID and kitchen photos — the check starts with these')
                    : t('Submitted. Tap to review what we hold.')
                }
                onPress={() => router.push('/cook-documents')}
              />
            ) : null}
          </View>
        </Reveal>

        {/* ---- Money ---- */}
        <Reveal delay={3}>
          <View style={{ marginTop: 28 }}>
            <SectionHeader
              small
              lead={t('EARNINGS')}
              subtitle={t('What has been released, what is held, and what has left.')}
              style={{ marginBottom: 12 }}
            />

            <Pressable
              accessibilityRole="link"
              accessibilityLabel={t('Earnings')}
              onPress={() => router.push('/cook/earnings')}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: pressed ? colors.sage100 : colors.line,
                },
                shadow.sm,
              ]}
            >
              <IconTile
                name="banknote"
                variant="sage"
                style={{ width: 46, height: 46, borderRadius: 15 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Price size={20}>৳{n(meals.wallet.cook)}</Price>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 1,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    color: colors.textMuted,
                  }}
                >
                  {/* The balance alone is ambiguous — owed or received? The
                      last run answers it in the same breath. */}
                  {lastPayout
                    ? t('Released · last paid {when} via {method}', {
                        when: formatOrderDate(lastPayout.paidAt, lang),
                        method: lastPayout.method,
                      })
                    : t('Released to you · payouts run every Sunday')}
                </Text>
              </View>
              {meals.wallet.held > 0 ? (
                <View
                  style={{
                    alignItems: 'flex-end',
                    gap: 2,
                  }}
                >
                  <Price size={15}>৳{n(meals.wallet.held)}</Price>
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: 10,
                      color: colors.saffron,
                    }}
                  >
                    {t('held')}
                  </Text>
                </View>
              ) : null}
              <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
            </Pressable>

            <ActionRow
              icon="star"
              tone="saffron"
              style={{ marginTop: 12 }}
              title={t('Reviews')}
              /* The score was already on three screens. What it is made of
                 was on none, so this row says the number a cook cannot
                 otherwise act on: how many people wrote something. */
              sub={
                kitchen?.reviewCount
                  ? t('{score} from {n} customers', {
                      score: n(kitchen.rating),
                      n: n(kitchen.reviewCount),
                    })
                  : t('Nobody has rated your kitchen yet')
              }
              onPress={() => router.push('/cook/reviews')}
            />
          </View>
        </Reveal>

        {/* ---- The account ----
            The person behind the kitchen. Their name, their contact, the
            photograph that follows their messages — all of it lives on the
            profile editor, which also owns the password. */}
        <Reveal delay={4}>
          <View style={{ marginTop: 28 }}>
            <SectionHeader
              small
              lead={t('ACCOUNT')}
              subtitle={t('You, rather than the kitchen.')}
              style={{ marginBottom: 12 }}
            />

            <ActionRow
              icon="user"
              title={account?.name || t('Your account')}
              sub={contact || t('Add an email or phone')}
              onPress={() => router.push('/edit-profile')}
            />
            <ActionRow
              icon="lock"
              style={{ marginTop: 12 }}
              title={t('Password and sign-in')}
              sub={t('Change your password, or how you sign in')}
              onPress={() => router.push('/edit-profile')}
            />
          </View>
        </Reveal>

        {/* ---- Support & log out ---- */}
        <Reveal delay={5}>
          <View style={{ marginTop: 28, marginBottom: 26 }}>
            <SectionHeader
              small
              lead={t('SUPPORT')}
              subtitle={t('A person, not a form.')}
              style={{ marginBottom: 12 }}
            />

            <ActionRow
              icon="chat"
              title={t('Message support')}
              sub={t('Anything about orders, money or verification')}
              onPress={() => router.push('/chat')}
            />

            <View style={{ marginTop: 16 }}>
              {confirmOut ? (
                <View
                  style={{
                    padding: 16,
                    borderRadius: radius.md,
                    backgroundColor: colors.primary50,
                    borderWidth: 1,
                    borderColor: colors.primary100,
                    gap: 12,
                  }}
                >
                  <Body size={14}>
                    {t('Log out of {who}? Your menu and orders stay on this device.', {
                      who: contact || t('this account'),
                    })}
                  </Body>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <Button
                      variant="glass"
                      label={t('Stay in')}
                      small
                      style={{ flex: 1 }}
                      onPress={() => setConfirmOut(false)}
                    />
                    <Button
                      label={t('Log out')}
                      small
                      style={{ flex: 1 }}
                      onPress={async () => {
                        setConfirmOut(false);
                        /* Drop out of cook mode before signing out, so the
                           gate does not bounce between two panels while the
                           account is being cleared. */
                        await setViewMode('customer');
                        // The token goes with the account, not after it.
                        await Promise.all([signOut(), signOutServer()]);
                        router.replace('/');
                      }}
                    />
                  </View>
                </View>
              ) : (
                <Button
                  variant="glass"
                  label={t('Log out')}
                  icon="x"
                  iconPosition="left"
                  block
                  onPress={() => {
                    Haptics.selectionAsync().catch(() => {});
                    setConfirmOut(true);
                  }}
                />
              )}
            </View>
          </View>
        </Reveal>
      </Container>
    </CookScreen>
  );
}
