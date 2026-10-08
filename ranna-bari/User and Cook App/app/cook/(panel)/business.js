/**
 * The kitchen as a business rather than as a kitchen.
 *
 * Earnings and Kitchen were two of the bar's seven destinations and they are
 * one subject: what this costs, what it pays, and how the place looks to a
 * customer. Neither is opened during service — they are the things a cook
 * checks before or after cooking — so neither needs to be one tap from
 * everywhere.
 *
 * Money leads, because it is the reason the rest of it exists.
 */
import React, { useState } from 'react';
import { Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Reveal from '../../../src/components/Reveal';
import SectionHeader from '../../../src/components/SectionHeader';
import Button from '../../../src/components/Button';
import { ActionRow } from '../../../src/components/CookBits';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useAuth } from '../../../src/store/AuthContext';
import { useSession } from '../../../src/store/SessionContext';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function BusinessScreen() {
  const router = useRouter();
  const { t, n } = useLang();
  const { colors } = useTheme();
  const { kitchen } = useKitchen();
  const { wallet } = useCommerce();
  const { account, signOut } = useAuth();
  /* The same rule Profile obeys: dropping only the local account would
     leave a live token on the device for the next person to inherit. */
  const { signOutServer } = useSession();
  const [confirmOut, setConfirmOut] = useState(false);

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead={t('YOUR')}
          accent={t('BUSINESS')}
          subtitle={t('What you are owed, and how customers find you.')}
          style={{ marginBottom: 22 }}
        />

        <View style={{ gap: 12 }}>
          <Reveal delay={1}>
            <ActionRow
              icon="banknote"
              tone="primary"
              title={t('Earnings')}
              sub={
                wallet?.cook
                  ? t('৳{n} released to you', { n: n(wallet.cook) })
                  : t('Payouts run every Sunday')
              }
              onPress={() => router.push('/cook/earnings')}
            />
          </Reveal>

          <Reveal delay={2}>
            <ActionRow
              icon="chefHat"
              title={t('Kitchen profile')}
              sub={
                kitchen?.isOpen
                  ? t('Open for orders')
                  : t('Closed — nothing can be ordered')
              }
              onPress={() => router.push('/cook/kitchen')}
            />
          </Reveal>

          <Reveal delay={3}>
            <ActionRow
              icon="star"
              tone="saffron"
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
          </Reveal>

          <Reveal delay={4}>
            <ActionRow
              icon="sliders"
              tone="saffron"
              title={t('Kitchen details')}
              sub={t('Name, specialty, description and delivery radius')}
              onPress={() => router.push('/cook/kitchen-details')}
            />
          </Reveal>
        </View>

        {/* ---- Log out ----
            The cook's exit lives here because this is the end of the
            business list: nothing after it to reach past. It keeps
            Profile's two-step confirm — the one destructive action on
            the screen should not look like the navigation around it. */}
        {account ? (
          <View style={{ marginTop: 24 }}>
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
                <Text
                  style={{
                    fontFamily: font.ui,
                    fontSize: type.sm,
                    lineHeight: 21,
                    color: colors.text,
                  }}
                >
                  {t('Log out of {who}? Your menu and orders stay on this device.', {
                    who: account.email || account.phone || t('this account'),
                  })}
                </Text>
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <Button
                    variant="glass"
                    label={t('Stay in')}
                    small
                    onPress={() => setConfirmOut(false)}
                    style={{ flex: 1 }}
                  />
                  <Button
                    label={t('Log out')}
                    small
                    onPress={async () => {
                      setConfirmOut(false);
                      await Promise.all([signOut(), signOutServer()]);
                    }}
                    style={{ flex: 1 }}
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
                onPress={() => setConfirmOut(true)}
              />
            )}
          </View>
        ) : null}
      </Container>
    </CookScreen>
  );
}
