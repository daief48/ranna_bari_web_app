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
import React, { useCallback, useMemo, useState } from 'react';
import { Image, Pressable, Share, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import FloatLabelInput from '../../../src/components/FloatLabelInput';
import { ActionRow, KycBanner } from '../../../src/components/CookBits';
import { IconTile, Tag } from '../../../src/components/Surfaces';
import { Body, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useAuth } from '../../../src/store/AuthContext';
import { useSession } from '../../../src/store/SessionContext';
import { useCookPayouts } from '../../../src/data/cook';
import { formatOrderDate, useOrders } from '../../../src/store/OrdersContext';
import { fetchMealOrders, fetchMyPlan, fetchMyService } from '../../../src/features/meal-plan/api';
import { countMeals, spreadMonth, todayKey } from '../../../src/features/meal-plan/format';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function CookProfile() {
  const { colors, shadow, isDark, toggle } = useTheme();
  const { t, n, lang, setLang } = useLang();
  const router = useRouter();
  const { kitchen, updateKitchen } = useKitchen();
  const meals = useCommerce();
  const { account, setViewMode, signOut } = useAuth();
  const { signOutServer, token } = useSession();
  const { payouts } = useCookPayouts();
  const { ordersForKitchen } = useOrders();

  const [confirmOut, setConfirmOut] = useState(false);

  /* Which business row in the menu is expanded — one at a time, so the
     section never turns into three open forms stacked on each other. */
  const [openSection, setOpenSection] = useState(null);
  const toggleSection = (key) => {
    Haptics.selectionAsync().catch(() => {});
    setOpenSection((cur) => (cur === key ? null : key));
  };

  const contact = account?.email || account?.phone || '';
  const unread = meals.unreadFor('cook');

  /* ---- the meal system's state, read the way the hub reads it ----
     The businesses menu answers the same four questions the hub answers,
     from the same endpoints — the two can never disagree about what "on"
     means. */
  const [mealService, setMealService] = useState(undefined);
  const [mealPlan, setMealPlan] = useState(null);
  const [mealBoard, setMealBoard] = useState(null);

  useFocusEffect(
    useCallback(() => {
      if (!token) return undefined;
      let alive = true;

      Promise.all([
        fetchMyService(token),
        fetchMyPlan(token),
        fetchMealOrders(token, todayKey()),
      ]).then(([svc, cal, day]) => {
        if (!alive) return;
        setMealService(svc.ok ? svc.result.service : null);
        setMealPlan(cal.ok ? cal.result : null);
        setMealBoard(day.ok ? day.result : null);
      });

      return () => {
        alive = false;
      };
    }, [token]),
  );

  const mealMonthDays = useMemo(() => {
    if (!mealPlan) return [];
    const source = mealPlan.cookPlan?.days?.length
      ? mealPlan.cookPlan
      : mealPlan.systemPlan
        ? mealPlan.systemPlan
        : null;
    return source ? spreadMonth(source.month, source.days) : [];
  }, [mealPlan]);
  const mealsWritten = countMeals(mealMonthDays);
  const mealLive = mealPlan
    ? !!(mealPlan.cookPlan?.status === 'published' || mealPlan.systemPlan)
    : null;
  const mealBoardOrders = mealBoard?.orders ?? [];
  const mealPlatesToday = mealBoardOrders.length;
  const mealPlatesDone = mealBoardOrders.filter(
    (o) => o.status === 'delivered' || o.status === 'completed',
  ).length;

  /* ---- the shops ---- */
  const myShops = kitchen ? meals.myStores(kitchen.id) : [];
  const shopProducts = myShops.reduce(
    (sum, s) => sum + meals.productsOf(s.id).filter((p) => p.active).length,
    0,
  );
  const shopOut = myShops.reduce(
    (sum, s) =>
      sum +
      meals
        .productsOf(s.id)
        .filter((p) => p.active && (p.stock ?? 0) <= 0).length,
    0,
  );
  const firstShop = myShops[0] ?? null;

  const dishCount = kitchen?.dishes?.length ?? 0;
  const dishLive = kitchen ? (kitchen.dishes ?? []).filter((d) => d.available).length : 0;

  /* The lifetime line under the kitchen card: when this kitchen joined and
     how many orders it has actually handed over. Both facts exist already —
     `createdAt` travels on `/kitchens/mine`, and the delivered count folds
     off the order list the panel is holding. */
  const deliveredCount = kitchen
    ? ordersForKitchen(kitchen.id).filter(
        (o) => o.status === 'delivered' || o.status === 'completed',
      ).length
    : 0;
  const memberSince = kitchen?.createdAt
    ? new Date(kitchen.createdAt).toLocaleDateString(lang === 'bn' ? 'bn-BD' : 'en-GB', {
        month: 'long',
        year: 'numeric',
      })
    : null;

  /* What the kitchen cooks beyond its primary specialty — the chips under
     the card. The wizard edits the set; this is where a customer-and-cook
     reading the profile sees the whole range. */
  const extraSpecialties = useMemo(
    () =>
      (kitchen?.specialties ?? []).filter(
        (s) => s && s !== kitchen?.specialty,
      ),
    [kitchen?.specialties, kitchen?.specialty],
  );

  /* ---- payout method ----
     Where the cook's money goes. Collapsed it is a row that says what is
     set; expanded it is a three-field form that writes through the kitchen
     patch, the same verb every other kitchen edit uses. */
  const [payOpen, setPayOpen] = useState(false);
  const [payMethod, setPayMethod] = useState(kitchen?.payoutMethod ?? '');
  const [payAccount, setPayAccount] = useState(kitchen?.payoutAccount ?? '');
  const [paySaving, setPaySaving] = useState(false);
  const [payError, setPayError] = useState('');

  const savePayout = async () => {
    if (!payMethod) {
      setPayError(t('Pick bKash or bank first.'));
      return;
    }
    if (!payAccount.trim()) {
      setPayError(t('Write the number or account the money should go to.'));
      return;
    }
    setPaySaving(true);
    const out = await updateKitchen({
      payoutMethod: payMethod,
      payoutAccount: payAccount.trim(),
    });
    setPaySaving(false);
    if (!out || out.ok === false) {
      setPayError(out?.message || t('That did not work'));
      return;
    }
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    setPayOpen(false);
  };

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
                <Button
                  variant="glass"
                  label={t('Share')}
                  icon="copy"
                  small
                  style={{ flex: 1 }}
                  disabled={!kitchen}
                  onPress={async () => {
                    /* A cook's best marketing is their own page. The link is
                       the app's scheme — it opens the kitchen for anybody
                       with RannaBari installed, and reads as an invitation
                       for anybody without. */
                    try {
                      await Share.share({
                        message: t('See {name} on RannaBari', { name: kitchen?.name ?? '' }),
                        url: `rannabari://chef/${kitchen?.id}`,
                      });
                    } catch {
                      /* Sharing dismissed is not a failure worth a dialog. */
                    }
                  }}
                />
              </View>

              {/* The rest of the range — chips for every specialty beyond the
                  primary, since the wizard edits the whole set and this card
                  showed only one. */}
              {extraSpecialties.length ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 6,
                    marginTop: 12,
                  }}
                >
                  {extraSpecialties.map((s) => (
                    <Tag key={s} label={t(s)} />
                  ))}
                </View>
              ) : null}

              {/* The lifetime line — when this kitchen joined and how many
                  orders it has actually handed over. A zero is printed
                  plainly: "0 orders delivered" is a new kitchen saying so,
                  not a broken counter. */}
              {memberSince ? (
                <Text
                  style={{
                    marginTop: 12,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    color: colors.textMuted,
                  }}
                >
                  {t('Since {when} · {n} orders delivered', {
                    when: memberSince,
                    n: n(deliveredCount),
                  })}
                </Text>
              ) : null}
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
                    : t('Submitted {when} · tap to review what we hold.', {
                        when: formatOrderDate(kitchen.documentsSubmittedAt, lang),
                      })
                }
                onPress={() => router.push('/cook-documents')}
              />
            ) : null}
          </View>
        </Reveal>

        {/* ---- The businesses ----
            A menu of the three counters, each collapsed to its one-line
            state and expandable to everything behind it: the kitchen's
            reach and menu, the meal service's terms and today's plates,
            the shop's shelf and delivery terms. The dashboard counts what
            needs acting on; this answers "what is actually set up". */}
        <Reveal delay={3}>
          <View style={{ marginTop: 28 }}>
            <SectionHeader
              small
              lead={t('BUSINESSES')}
              subtitle={t('Tap one to see everything set up behind it.')}
              style={{ marginBottom: 12 }}
            />

            {/* ---- kitchen ---- */}
            <BusinessRow
              icon="chefHat"
              variant="sage"
              title={kitchen?.name || t('Kitchen')}
              summary={
                kitchen?.isOpen
                  ? t('Open · {n} dishes live', { n: n(dishLive) })
                  : t('Closed · {n} dishes listed', { n: n(dishCount) })
              }
              open={openSection === 'kitchen'}
              onToggle={() => toggleSection('kitchen')}
            >
              <DetailRow label={t('Area')} value={kitchen?.area || '—'} />
              <DetailRow
                label={t('Delivery radius')}
                value={t('{n} km', { n: n(Number(kitchen?.deliveryRadiusKm ?? 0).toFixed(1)) })}
              />
              <DetailRow
                label={t('Menu')}
                value={t('{live} of {total} live', {
                  live: n(dishLive),
                  total: n(dishCount),
                })}
              />
              <DetailRow
                label={t('Rating')}
                value={
                  kitchen?.reviewCount
                    ? t('{score} · {n} reviews', {
                        score: n(Number(kitchen.rating ?? 0).toFixed(1)),
                        n: n(kitchen.reviewCount),
                      })
                    : t('No reviews yet')
                }
              />
              <DetailRow
                label={t('Status')}
                value={kitchen?.isOpen ? t('Open for orders') : t('Closed')}
                tone={kitchen?.isOpen ? colors.sage : colors.textMuted}
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Button
                  label={t('Edit details')}
                  icon="sliders"
                  small
                  style={{ flex: 1 }}
                  onPress={() => router.push('/cook/kitchen-details')}
                />
                <Button
                  variant="glass"
                  label={t('Menu')}
                  icon="utensils"
                  small
                  style={{ flex: 1 }}
                  onPress={() => router.push('/cook/menu')}
                />
              </View>
            </BusinessRow>

            {/* ---- monthly meals ---- */}
            <BusinessRow
              icon="pot"
              variant="primary"
              title={t('Monthly meals')}
              summary={
                mealService === undefined
                  ? t('Checking…')
                  : !mealService
                    ? t('Not started yet')
                    : mealService.active
                      ? t('Open · ৳{rate} a meal', { rate: n(mealService.effectiveRate) })
                      : t('Set up, not switched on')
              }
              open={openSection === 'meals'}
              onToggle={() => toggleSection('meals')}
            >
              {mealService ? (
                <>
                  <DetailRow
                    label={t('Category')}
                    value={t(mealService.categoryLabel || mealService.categoryKey)}
                  />
                  <DetailRow label={t('Rate')} value={t('৳{rate} a meal', { rate: n(mealService.effectiveRate) })} />
                  <DetailRow
                    label={t('This month’s menu')}
                    value={
                      mealLive
                        ? t('{n} meals set', { n: n(mealsWritten) })
                        : t('Not published')
                    }
                    tone={mealLive ? null : colors.saffron}
                  />
                  <DetailRow
                    label={t('Today’s plates')}
                    value={
                      mealPlatesToday
                        ? t('{done} of {total} handed over', {
                            done: n(mealPlatesDone),
                            total: n(mealPlatesToday),
                          })
                        : t('None booked')
                    }
                  />
                  <DetailRow
                    label={t('Status')}
                    value={mealService.active ? t('Open for bookings') : t('Not offered')}
                    tone={mealService.active ? colors.sage : colors.saffron}
                  />
                  <Button
                    label={t('Open the hub')}
                    variant="glass"
                    small
                    onPress={() => router.push('/cook/meal-hub')}
                    style={{ alignSelf: 'flex-start', marginTop: 12 }}
                  />
                </>
              ) : (
                <View style={{ gap: 10 }}>
                  <Body muted size={13}>
                    {t('No meal service yet — set a category and a rate to open a month of cooking.')}
                  </Body>
                  <Button
                    label={t('Start a meal service')}
                    small
                    onPress={() => router.push('/cook/meal-hub')}
                    style={{ alignSelf: 'flex-start' }}
                  />
                </View>
              )}
            </BusinessRow>

            {/* ---- the shop(s) ---- */}
            <BusinessRow
              icon="box"
              variant="saffron"
              title={t('Shop')}
              summary={
                myShops.length === 0
                  ? t('Not opened yet')
                  : firstShop?.isOpen
                    ? t('Open · {n} products', { n: n(shopProducts) })
                    : myShops.length > 1
                      ? t('{n} shops · closed', { n: n(myShops.length) })
                      : t('Closed · {n} products', { n: n(shopProducts) })
              }
              open={openSection === 'shop'}
              onToggle={() => toggleSection('shop')}
            >
              {firstShop ? (
                <>
                  <DetailRow
                    label={t('Shop name')}
                    value={
                      myShops.length > 1
                        ? t('{n} shops', { n: n(myShops.length) })
                        : firstShop.name
                    }
                  />
                  <DetailRow label={t('Area')} value={firstShop.area || '—'} />
                  <DetailRow
                    label={t('Products')}
                    value={t('{n} on sale · {m} out of stock', {
                      n: n(shopProducts - shopOut),
                      m: n(shopOut),
                    })}
                    tone={shopOut ? colors.saffron : null}
                  />
                  <DetailRow
                    label={t('Delivery')}
                    value={t('৳{n} fee · free over ৳{m}', {
                      n: n(firstShop.deliveryFee ?? 0),
                      m: n(firstShop.freeDeliveryOver ?? 0),
                    })}
                  />
                  <DetailRow
                    label={t('Status')}
                    value={firstShop.isOpen ? t('Open') : t('Closed')}
                    tone={firstShop.isOpen ? colors.sage : colors.textMuted}
                  />
                  <Button
                    label={t('Open the shop hub')}
                    variant="glass"
                    small
                    onPress={() => router.push('/cook/store')}
                    style={{ alignSelf: 'flex-start', marginTop: 12 }}
                  />
                </>
              ) : (
                <View style={{ gap: 10 }}>
                  <Body muted size={13}>
                    {t('A second business — cakes, pitha, achar, anything that keeps.')}
                  </Body>
                  <Button
                    label={t('Open your shop')}
                    small
                    onPress={() => router.push('/cook/store')}
                    style={{ alignSelf: 'flex-start' }}
                  />
                </View>
              )}
            </BusinessRow>
          </View>
        </Reveal>

        {/* ---- Money ---- */}
        <Reveal delay={4}>
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

            {/* ---- Payout method ----
                Collapsed, a row that says where money goes. Expanded, a small
                form: bKash or bank, and the number. The operator reads this
                on the kitchen page before marking a payout run paid — which
                is why it lives beside the balance rather than in settings:
                it is money's address, and money is this section's subject. */}
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ expanded: payOpen }}
              accessibilityLabel={t('Payout method')}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                setPayMethod(kitchen?.payoutMethod ?? '');
                setPayAccount(kitchen?.payoutAccount ?? '');
                setPayError('');
                setPayOpen((v) => !v);
              }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  marginTop: 12,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: payOpen ? colors.sage100 : pressed ? colors.sage100 : colors.line,
                },
                shadow.sm,
              ]}
            >
              <IconTile
                name="banknote"
                variant="sage"
                style={{ width: 42, height: 42, borderRadius: 14 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: 16,
                    letterSpacing: -0.16,
                    color: colors.text,
                  }}
                >
                  {t('Payout method')}
                </Text>
                <Text
                  numberOfLines={1}
                  style={{
                    marginTop: 1,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    color: colors.textMuted,
                  }}
                >
                  {kitchen?.payoutMethod
                    ? t('{method} · ····{last4}', {
                        method: kitchen.payoutMethod === 'bkash' ? t('bKash') : t('Bank'),
                        last4: String(kitchen.payoutAccount || '').slice(-4),
                      })
                    : t('Not set — where should your money go?')}
                </Text>
              </View>
              <Icon
                name={payOpen ? 'chevronDown' : 'chevronRight'}
                size={17}
                color={colors.textLight}
                strokeWidth={2}
              />
            </Pressable>

            {payOpen ? (
              <View
                style={{
                  marginTop: -8,
                  padding: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                  borderTopWidth: 0,
                  borderTopLeftRadius: 0,
                  borderTopRightRadius: 0,
                  gap: 6,
                }}
              >
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {[
                    { key: 'bkash', label: t('bKash') },
                    { key: 'bank', label: t('Bank') },
                  ].map((opt) => {
                    const on = payMethod === opt.key;
                    return (
                      <Pressable
                        key={opt.key}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        onPress={() => {
                          setPayMethod(opt.key);
                          setPayError('');
                        }}
                        style={({ pressed }) => ({
                          paddingVertical: 9,
                          paddingHorizontal: 18,
                          borderRadius: radius.pill,
                          backgroundColor: on ? colors.sage : colors.surfaceSolid,
                          borderWidth: 1,
                          borderColor: on ? colors.sage : colors.line,
                          transform: [{ scale: pressed ? 0.97 : 1 }],
                        })}
                      >
                        <Text
                          style={{
                            fontFamily: on ? font.uiBold : font.uiSemi,
                            fontSize: 13.5,
                            color: on ? '#FFFFFF' : colors.text,
                          }}
                        >
                          {opt.label}
                        </Text>
                      </Pressable>
                    );
                  })}
                </View>

                <FloatLabelInput
                  label={payMethod === 'bank' ? t('Account number') : t('bKash number')}
                  value={payAccount}
                  onChangeText={(v) => {
                    setPayAccount(v.replace(/[^0-9]/g, ''));
                    setPayError('');
                  }}
                  keyboardType="number-pad"
                  placeholder={payMethod === 'bank' ? t('The account payouts land in') : '01XXXXXXXXX'}
                />

                {payError ? (
                  <Text
                    style={{
                      fontFamily: font.ui,
                      fontSize: type.xs,
                      color: colors.primary,
                    }}
                  >
                    {payError}
                  </Text>
                ) : null}

                <Button
                  label={paySaving ? t('Saving…') : t('Save')}
                  icon={paySaving ? undefined : 'check'}
                  small
                  disabled={paySaving}
                  onPress={savePayout}
                  style={{ alignSelf: 'flex-end', marginTop: 4 }}
                />
              </View>
            ) : null}

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
        <Reveal delay={5}>
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
            <ActionRow
              icon="bell"
              style={{ marginTop: 12 }}
              title={t('Notifications')}
              sub={
                unread
                  ? t('{n} unread', { n: n(unread) })
                  : t('Interest, orders and payouts')
              }
              onPress={() => router.push('/notifications')}
            />
          </View>
        </Reveal>

        {/* ---- Settings ----
            The app's own dials, which lived only as small icons in the
            navbar's glass — findable once you knew, invisible otherwise.
            They belong here, beside the account they personalize. */}
        <Reveal delay={4}>
          <View style={{ marginTop: 28 }}>
            <SectionHeader
              small
              lead={t('SETTINGS')}
              subtitle={t('The app, your way.')}
              style={{ marginBottom: 12 }}
            />

            {/* Language — both options visible, the current one filled, so
                switching costs one tap and no guessing. */}
            <View
              style={[
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                },
                shadow.sm,
              ]}
            >
              <IconTile
                name="chat"
                variant="sage"
                style={{ width: 42, height: 42, borderRadius: 14 }}
              />
              <Text
                style={{
                  flex: 1,
                  fontFamily: font.displayBold,
                  fontSize: 16,
                  letterSpacing: -0.16,
                  color: colors.text,
                }}
              >
                {t('Language')}
              </Text>
              {[
                { code: 'en', label: 'English' },
                { code: 'bn', label: 'বাংলা' },
              ].map((opt) => {
                const on = lang === opt.code;
                return (
                  <Pressable
                    key={opt.code}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    onPress={() => setLang(opt.code)}
                    style={({ pressed }) => ({
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: radius.pill,
                      backgroundColor: on ? colors.sage : colors.sunken,
                      borderWidth: 1,
                      borderColor: on ? colors.sage : colors.line,
                      transform: [{ scale: pressed ? 0.96 : 1 }],
                    })}
                  >
                    <Text
                      style={{
                        fontFamily: on ? font.uiBold : font.uiSemi,
                        fontSize: 13,
                        color: on ? '#FFFFFF' : colors.textMuted,
                      }}
                    >
                      {opt.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {/* Dark mode — a plain switch row. */}
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: isDark }}
              accessibilityLabel={t('Dark mode')}
              onPress={() => {
                Haptics.selectionAsync().catch(() => {});
                toggle();
              }}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  padding: 16,
                  marginTop: 12,
                  borderRadius: radius.lg,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: pressed ? colors.sage100 : colors.line,
                  opacity: pressed ? 0.96 : 1,
                },
                shadow.sm,
              ]}
            >
              <IconTile
                name={isDark ? 'moon' : 'sun'}
                variant="saffron"
                style={{ width: 42, height: 42, borderRadius: 14 }}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{
                    fontFamily: font.displayBold,
                    fontSize: 16,
                    letterSpacing: -0.16,
                    color: colors.text,
                  }}
                >
                  {t('Dark mode')}
                </Text>
                <Text
                  style={{
                    marginTop: 1,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    color: colors.textMuted,
                  }}
                >
                  {isDark ? t('On — the kitchen at night') : t('Off — washi paper light')}
                </Text>
              </View>
              <View
                style={{
                  width: 46,
                  height: 27,
                  borderRadius: 14,
                  padding: 3,
                  justifyContent: 'center',
                  alignItems: isDark ? 'flex-end' : 'flex-start',
                  backgroundColor: isDark ? colors.sage : colors.line,
                }}
              >
                <View
                  style={{
                    width: 21,
                    height: 21,
                    borderRadius: 11,
                    backgroundColor: colors.raised,
                  }}
                />
              </View>
            </Pressable>

            {/* Customer view — the door that exists on a hidden screen and
                in a navbar pill, but never in words. */}
            <ActionRow
              icon="cart"
              tone="saffron"
              style={{ marginTop: 12 }}
              title={t('Customer view')}
              sub={t('Browse and order as a customer')}
              onPress={async () => {
                await setViewMode('customer');
                router.replace('/');
              }}
            />
          </View>
        </Reveal>

        {/* ---- Support & log out ---- */}
        <Reveal delay={6}>
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

/**
 * One expandable business row in the profile menu.
 *
 * Collapsed, a tinted header that says the business's name and its one-line
 * state. Expanded, whatever detail rows the caller hands over, plus its
 * action buttons. The accent colour is per business — sage for the kitchen,
 * vermilion for meals, saffron for the shop — the same identities their
 * dashboard panels wear.
 */
function BusinessRow({ icon, variant, title, summary, open, onToggle, children }) {
  const { colors, shadow } = useTheme();

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          overflow: 'hidden',
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: open ? colors.sage100 : colors.line,
        },
        shadow.sm,
      ]}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        accessibilityLabel={title}
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 12,
          padding: 14,
          backgroundColor: colors[variant === 'sage' ? 'sage50' : variant === 'saffron' ? 'saffron50' : 'primary50'],
          opacity: pressed ? 0.93 : 1,
        })}
      >
        <IconTile name={icon} variant={variant} style={{ width: 40, height: 40, borderRadius: 14 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.displayBold,
              fontSize: 15.5,
              letterSpacing: -0.16,
              color: colors.text,
            }}
          >
            {title}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.ui,
              fontSize: type.xs,
              color: colors.textMuted,
            }}
          >
            {summary}
          </Text>
        </View>
        <Icon
          name={open ? 'chevronDown' : 'chevronRight'}
          size={17}
          color={colors.textLight}
          strokeWidth={2}
        />
      </Pressable>

      {open ? (
        <View style={{ padding: 14, paddingTop: 10, gap: 9 }}>{children}</View>
      ) : null}
    </View>
  );
}

/** One label/value line inside an expanded business row. */
function DetailRow({ label, value, tone }) {
  const { colors } = useTheme();

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 3,
      }}
    >
      <Text
        style={{
          fontFamily: font.ui,
          fontSize: type.xs + 0.5,
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        style={{
          flexShrink: 1,
          fontFamily: font.uiSemi,
          fontSize: type.xs + 0.5,
          textAlign: 'right',
          color: tone ?? colors.text,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
