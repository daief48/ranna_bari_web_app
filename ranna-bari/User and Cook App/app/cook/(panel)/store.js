/**
 * The cook's shop, at a glance.
 *
 * A hub rather than a tab: the cook bar already carries six destinations, and
 * a shop is a place you go into and work in for a while rather than something
 * you flick between. Everything under it hangs off this screen.
 *
 * The numbers are chosen to be the ones that need acting on. Total products
 * is trivia; five things out of stock and two pre-orders nobody has answered
 * are today's work, so those are the ones that get colour.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import FloatLabelInput from '../../../src/components/FloatLabelInput';
import { ActionRow, FieldError, WizardSteps } from '../../../src/components/CookBits';
import { CountTile, EmptyState } from '../../../src/components/MealBits';
import { BlockLabel } from '../../../src/components/StoreBits';
import { Body } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';
import { useCommerce } from '../../../src/store/CommerceContext';
import { useAction } from '../../../src/components/Alert';
import { useLang } from '../../../src/i18n/LanguageContext';

export default function CookStoreHub() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  /* Every write below reports what happened. */
  const run = useAction();
  const router = useRouter();
  const { kitchen } = useKitchen();
  const shop = useCommerce();

  const store = kitchen ? shop.storeForKitchen(kitchen.id) : null;

  /* No shop yet: a two-step setup, not a single blind button. The old flow
     opened the shop silently with borrowed values and dropped the cook into
     settings — the shop existed before they had said anything about it. Two
     screens, four fields, and the cook has said what it is called and what
     delivery costs by the time it exists. */
  if (!store) {
    return (
      <CookScreen>
        <Container>
          <Back />
          <SectionHeader
            lead={t('YOUR')}
            accent={t('SHOP')}
            subtitle={t('Sell cakes, pitha, achar — anything you make that keeps.')}
          />
          <StoreSetup kitchen={kitchen} />
        </Container>
      </CookScreen>
    );
  }

  const view = shop.storeOverview(store);

  return (
    <CookScreen>
      <Container>
        <Back />

        <SectionHeader
          lead={t('YOUR')}
          accent={t('SHOP')}
          subtitle={
            store.isOpen
              ? t('{name} is open.', { name: store.name })
              : t('{name} is closed. Nothing can be bought.', { name: store.name })
          }
        />

        {/* ---- the shutter ---- */}
        <Reveal delay={1}>
          <Pressable
            accessibilityRole="switch"
            accessibilityState={{ checked: store.isOpen }}
            accessibilityLabel={store.isOpen ? t('Shop open') : t('Tap to open your shop')}
            onPress={() => {
              Haptics.selectionAsync().catch(() => {});
              run(
                () => shop.toggleStoreOpen(store.id),
                () => (store.isOpen ? t('Shop closed.') : t('Shop is open.')),
              );
            }}
            style={({ pressed }) => [
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 16,
                padding: 18,
                borderRadius: radius.md,
                backgroundColor: store.isOpen ? colors.sage : colors.sunken,
                borderWidth: 1,
                borderColor: store.isOpen ? 'transparent' : colors.line,
                transform: [{ scale: pressed ? 0.99 : 1 }],
              },
              store.isOpen ? shadow.md : shadow.sm,
            ]}
          >
            <Icon
              name={store.isOpen ? 'box' : 'moon'}
              size={22}
              color={store.isOpen ? '#FFFFFF' : colors.textMuted}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontFamily: font.displayExtra,
                  fontSize: 20,
                  letterSpacing: -0.4,
                  color: store.isOpen ? '#FFFFFF' : colors.text,
                }}
              >
                {store.isOpen ? t('Shop open') : t('Shop closed')}
              </Text>
              <Text
                style={{
                  marginTop: 2,
                  fontFamily: font.ui,
                  fontSize: type.xs + 1,
                  color: store.isOpen ? 'rgba(255,255,255,0.9)' : colors.textMuted,
                }}
              >
                {store.isOpen
                  ? t('{n} products on sale', { n: n(view.active) })
                  : t('Tap to start selling')}
              </Text>
            </View>
          </Pressable>
        </Reveal>

        {/* ---- what needs doing ---- */}
        <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
          <CountTile
            value={n(view.pendingPreorders)}
            label={t('Pre-orders')}
            tone={view.pendingPreorders ? 'primary' : 'sage'}
          />
          <CountTile
            value={n(view.activeOrders)}
            label={t('Active orders')}
            tone={view.activeOrders ? 'saffron' : 'sage'}
          />
          <CountTile
            value={n(view.outOfStock)}
            label={t('Out of stock')}
            tone={view.outOfStock ? 'saffron' : 'sage'}
          />
        </View>

        {/* ---- the money ---- */}
        <View
          style={[
            {
              flexDirection: 'row',
              marginTop: 12,
              borderRadius: radius.md,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              overflow: 'hidden',
            },
            shadow.sm,
          ]}
        >
          <Money label={t('Released to you')} amount={view.earned} tone="sage" />
          <View style={{ width: 1, backgroundColor: colors.line2 }} />
          <Money label={t('Held for you')} amount={view.pending} tone="saffron" />
        </View>

        {/* ---- the catalogue in numbers ---- */}
        <View style={{ marginTop: 26 }}>
          <BlockLabel text={t('Your catalogue')} />
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <CountTile value={n(view.products)} label={t('Products')} />
            <CountTile value={n(view.categories)} label={t('Categories')} />
            <CountTile value={n(view.preorderable)} label={t('Pre-orderable')} />
            <CountTile value={n(view.completedOrders)} label={t('Completed')} />
          </View>
        </View>

        {/* ---- everything you can do ---- */}
        <View style={{ marginTop: 26, gap: 12 }}>
          <BlockLabel text={t('Manage')} />
          <ActionRow
            icon="plus"
            tone="primary"
            title={t('Add a product')}
            sub={t('Name, price, stock and photos')}
            onPress={() => router.push('/cook/store/product/new')}
          />
          <ActionRow
            icon="box"
            title={t('Products and stock')}
            sub={t('{n} listed, {out} out of stock', {
              n: n(view.products),
              out: n(view.outOfStock),
            })}
            onPress={() => router.push('/cook/store/products')}
          />
          <ActionRow
            icon="sliders"
            title={t('Categories')}
            sub={t('{n} categories, in your own order', { n: n(view.categories) })}
            onPress={() => router.push('/cook/store/categories')}
          />
          <ActionRow
            icon="clock"
            tone={view.pendingPreorders ? 'primary' : 'sage'}
            title={t('Pre-orders')}
            sub={
              view.pendingPreorders
                ? t('{n} waiting for your answer', { n: n(view.pendingPreorders) })
                : t('Nothing waiting')
            }
            onPress={() => router.push('/cook/store/preorders')}
          />
          <ActionRow
            icon="receipt"
            title={t('Shop orders')}
            sub={t('{n} in progress', { n: n(view.activeOrders) })}
            onPress={() => router.push('/cook/store/orders')}
          />
          <ActionRow
            icon="chefHat"
            title={t('Shop settings')}
            sub={t('Name, photos, delivery and contact')}
            onPress={() => router.push('/cook/store/settings')}
          />
          <ActionRow
            icon="eye"
            title={t('View your shop')}
            sub={t('See it the way a customer does')}
            onPress={() => router.push(`/stores/${store.id}`)}
          />
        </View>
      </Container>
    </CookScreen>
  );
}

function Back() {
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => (router.canGoBack() ? router.back() : router.replace('/cook'))}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 18,
        alignSelf: 'flex-start',
      }}
    >
      <Icon name="arrowLeft" size={16} color={colors.sage} strokeWidth={2} />
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: type.xs,
          letterSpacing: 1,
          textTransform: 'uppercase',
          color: colors.sage,
        }}
      >
        {t('Kitchen')}
      </Text>
    </Pressable>
  );
}

function Money({ label, amount, tone }) {
  const { colors } = useTheme();
  const { n } = useLang();
  const accent = tone === 'saffron' ? colors.saffron : colors.sage;
  return (
    <View style={{ flex: 1, gap: 4, padding: 16 }}>
      <Text
        style={{
          fontFamily: font.uiBold,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
          color: colors.textMuted,
        }}
      >
        {label}
      </Text>
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        style={{
          fontFamily: font.displayExtra,
          fontSize: 26,
          letterSpacing: -0.6,
          color: accent,
        }}
      >
        ৳{n(amount)}
      </Text>
    </View>
  );
}

/**
 * The two steps between "no shop" and "a shop".
 *
 * Step one names it; step two prices delivery. Everything else — the logo,
 * the cover, the location — is borrowed from the kitchen, which already
 * knows it, and can be changed in settings afterwards. Four fields is what
 * stands between a cook and a storefront, and the wizard says so: the count
 * is visible, the fields are the work, and nothing is invented on their
 * behalf.
 */
function StoreSetup({ kitchen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const shop = useCommerce();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState({});

  /* A shop on the same street as its kitchen, until the cook says otherwise. */
  const [name, setName] = useState(kitchen?.name ?? '');
  const [tagline, setTagline] = useState('');
  const [fee, setFee] = useState('0');
  const [freeOver, setFreeOver] = useState('');

  const STEPS = [t('The storefront'), t('Delivery')];

  const next = () => {
    if (step === 0) {
      if (!name.trim()) {
        setErrors({ name: t('Give the shop a name.') });
        return;
      }
      setErrors({});
    }
    Haptics.selectionAsync().catch(() => {});
    setStep(1);
  };

  const open = async () => {
    const feeValue = Number(fee || '0');
    if (!Number.isFinite(feeValue) || feeValue < 0) {
      setErrors({ fee: t('Delivery fee is a number of taka.') });
      return;
    }
    const overValue = freeOver.trim() ? Number(freeOver) : null;
    if (freeOver.trim() && (!Number.isFinite(overValue) || overValue < 0)) {
      setErrors({ fee: t('Free-delivery threshold is a number of taka.') });
      return;
    }

    setSaving(true);
    const out = await shop.saveStore(kitchen.id, {
      name: name.trim(),
      tagline: tagline.trim(),
      logo: kitchen.avatar,
      cover: kitchen.coverImage,
      area: kitchen.area,
      lat: kitchen.lat,
      lng: kitchen.lng,
      deliveryRadiusKm: kitchen.deliveryRadiusKm,
      deliveryFee: Math.max(0, Math.round(feeValue)),
      freeDeliveryOver: freeOver.trim() ? Math.round(overValue) : null,
    });
    setSaving(false);

    if (!out.ok) {
      setErrors({ form: out.message || t('That did not work') });
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    /* Straight into settings, where the photographs are — the one thing the
       borrowed kitchen values cannot already be right about. */
    router.push('/cook/store/settings');
  };

  return (
    <View>
      <WizardSteps steps={STEPS} current={step} />

      <Reveal delay={1}>
        <EmptyState
          icon="box"
          title={t('You have not opened a shop yet')}
          body={t(
            'A shop is your own storefront: your categories, your products, your stock. It sits alongside your kitchen, not instead of it.',
          )}
        />
      </Reveal>

      {step === 0 ? (
        <Reveal delay={2}>
          <View style={{ marginTop: 20 }}>
            <FloatLabelInput
              label={t('Shop name')}
              value={name}
              onChangeText={(v) => {
                setName(v);
                setErrors({});
              }}
              placeholder={t('What customers see on the map')}
            />
            <FieldError text={errors.name} />

            <FloatLabelInput
              label={t('Tagline (optional)')}
              value={tagline}
              onChangeText={setTagline}
              placeholder={t('One line on what you make and keep')}
            />

            <Button
              label={t('Continue')}
              icon="arrowRight"
              block
              onPress={next}
              style={{ marginTop: 8 }}
            />
          </View>
        </Reveal>
      ) : (
        <Reveal delay={2}>
          <View style={{ marginTop: 20 }}>
            <Body muted size={13.5} style={{ marginBottom: 16 }}>
              {t('Two numbers, and delivery is priced. You can change both later.')}
            </Body>

            <FloatLabelInput
              label={t('Delivery fee in taka')}
              value={fee}
              onChangeText={(v) => {
                setFee(v.replace(/[^0-9]/g, ''));
                setErrors({});
              }}
              keyboardType="number-pad"
              placeholder="40"
            />

            <FloatLabelInput
              label={t('Free delivery over (optional)')}
              value={freeOver}
              onChangeText={(v) => {
                setFreeOver(v.replace(/[^0-9]/g, ''));
                setErrors({});
              }}
              keyboardType="number-pad"
              placeholder={t('Leave empty for no free delivery')}
            />
            <FieldError text={errors.fee} />

            {errors.form ? <FieldError text={errors.form} /> : null}

            <Button
              label={saving ? t('Opening…') : t('Open your shop')}
              icon={saving ? undefined : 'check'}
              block
              disabled={saving || !kitchen}
              onPress={open}
            />
            <Button
              variant="ghost"
              label={t('Back')}
              block
              onPress={() => setStep(0)}
              style={{ marginTop: 10 }}
            />
          </View>
        </Reveal>
      )}
    </View>
  );
}
