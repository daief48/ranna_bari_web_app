/**
 * The shop basket, and paying for it.
 *
 * One screen rather than a basket page and a checkout page: there is one
 * payment method, the amount is already known, and a second step would exist
 * only to be tapped through. What it does add is the revalidation -- every
 * line is priced again from the live product on every render, so a basket
 * that went stale overnight says so next to the line that went stale rather
 * than failing at the till.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Icon from '../src/components/Icon';
import Button from '../src/components/Button';
import SectionHeader from '../src/components/SectionHeader';
import { Body } from '../src/components/Typography';
import { EmptyState, errorText } from '../src/components/MealBits';
import { QtyStepper, Totals, Placeholder } from '../src/components/StoreBits';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, radius, type } from '../src/theme/tokens';
import { useAuth } from '../src/store/AuthContext';
import { useCommerce } from '../src/store/CommerceContext';
import { addressFromAccount, customerKeyOf } from '../src/lib/ledger';
import { useLang } from '../src/i18n/LanguageContext';
import { useAlert } from '../src/components/Alert';

export default function StoreCheckoutScreen() {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const alert = useAlert();
  const router = useRouter();
  const { account, isSignedIn } = useAuth();
  const shop = useCommerce();

  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const key = customerKeyOf(account);
  const priced = shop.priceCart(key);
  const balance = shop.wallet.customer;

  const blocked = priced.problems.length > 0;
  const affordable = balance >= priced.total;

  const place = async () => {
    if (!isSignedIn) return router.push('/auth');
    setBusy(true);
    const out = await shop.checkout(key, {
      name: account?.name ?? '',
      phone: account?.phone ?? '',
      address: addressFromAccount(account),
    });
    setBusy(false);

    if (!out.ok) return alert.error(errorText(out.error, t, n, out));
    router.replace(`/store-order/${out.result[0].id}`);
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/stores'))}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 20,
            alignSelf: 'flex-start',
          }}
        >
          <Icon name="arrowLeft" size={16} color={colors.primary} strokeWidth={2} />
          <Text
            style={{
              fontFamily: font.uiBold,
              fontSize: type.xs,
              letterSpacing: 1,
              textTransform: 'uppercase',
              color: colors.primary,
            }}
          >
            {t('Back')}
          </Text>
        </Pressable>

        <SectionHeader
          lead={t('YOUR')}
          accent={t('BASKET')}
          subtitle={t('Paid from your wallet, and held until the food reaches you.')}
          style={{ marginBottom: 22 }}
        />

        {!priced.lines.length ? (
          <EmptyState
            icon="cart"
            title={t('Your basket is empty')}
            body={t('Anything you add from a shop lands here.')}
            action={<Button label={t('Browse shops')} onPress={() => router.push('/stores')} />}
          />
        ) : (
          <>
            <View style={{ gap: 12 }}>
              {priced.lines.map((line) => (
                <Line
                  key={line.key}
                  line={line}
                  onQty={(v) => shop.setCartQty(key, line.key, v)}
                  onRemove={() => shop.removeFromCart(key, line.key)}
                  onOpen={() => router.push(`/product/${line.productId}`)}
                />
              ))}
            </View>

            <View style={{ marginTop: 22 }}>
              <Totals
                subtotal={priced.subtotal}
                delivery={priced.delivery}
                total={priced.total}
              />
            </View>

            {/* ---- what a pre-order in the basket actually means ---- */}
            {priced.hasPreorder ? (
              <View
                style={{
                  gap: 8,
                  padding: 16,
                  marginTop: 16,
                  borderRadius: radius.sm,
                  backgroundColor: colors.saffron50,
                  borderWidth: 1,
                  borderColor: colors.saffron100,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Icon name="clock" size={16} color={colors.saffron} />
                  <Text
                    style={{ fontFamily: font.uiBold, fontSize: type.sm + 1, color: colors.text }}
                  >
                    {t('Some of this is a pre-order')}
                  </Text>
                </View>
                <Body muted size={14}>
                  {t(
                    'Pre-ordered items go to the cook as a request and are billed separately from the rest. If the cook cannot take them, that part is refunded in full.',
                  )}
                </Body>
              </View>
            ) : null}

            {/* ---- wallet ---- */}
            <Pressable
              accessibilityRole="link"
              onPress={() => router.push('/wallet')}
              style={({ pressed }) => [
                {
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 16,
                  marginTop: 16,
                  borderRadius: radius.sm,
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: affordable
                    ? pressed
                      ? colors.primary200
                      : colors.line
                    : colors.saffron100,
                },
                shadow.sm,
              ]}
            >
              <Icon
                name="banknote"
                size={17}
                color={affordable ? colors.sage : colors.saffron}
              />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text
                  style={{ fontFamily: font.uiSemi, fontSize: type.sm + 1, color: colors.text }}
                >
                  {t('Wallet balance')}: ৳{n(balance)}
                </Text>
                {!affordable ? (
                  <Text
                    style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.saffron }}
                  >
                    {t('Top up ৳{n} to place this order', { n: n(priced.total - balance) })}
                  </Text>
                ) : (
                  <Text
                    style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
                  >
                    {t('৳{n} left after this order', { n: n(balance - priced.total) })}
                  </Text>
                )}
              </View>
              <Icon name="chevronRight" size={15} color={colors.textLight} />
            </Pressable>

            {error ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  padding: 14,
                  marginTop: 16,
                  borderRadius: radius.sm,
                  backgroundColor: colors.primary50,
                  borderWidth: 1,
                  borderColor: colors.primary200,
                }}
              >
                <Icon name="alertCircle" size={16} color={colors.primary} />
                <Text
                  style={{ flex: 1, fontFamily: font.ui, fontSize: type.sm, color: colors.text }}
                >
                  {error}
                </Text>
              </View>
            ) : null}

            <View style={{ marginTop: 20, gap: 10 }}>
              <Button
                label={
                  blocked
                    ? t('Fix the basket to continue')
                    : affordable
                      ? t('Place order · ৳{n}', { n: n(priced.total) })
                      : t('Top up to continue')
                }
                icon="lock"
                iconPosition="left"
                block
                disabled={blocked || busy}
                onPress={affordable ? place : () => router.push('/wallet')}
              />
              <Text
                style={{
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  lineHeight: type.xs * 1.6,
                  textAlign: 'center',
                  color: colors.textLight,
                }}
              >
                {t('The cook is paid only after you confirm the food arrived.')}
              </Text>
            </View>
          </>
        )}
      </Container>
    </Screen>
  );
}

/**
 * One basket line.
 *
 * A line that has gone wrong keeps its quantity control and gains a reason,
 * rather than being removed for you -- someone who put four jars in a basket
 * should be told there are two left, not silently given two.
 */
function Line({ line, onQty, onRemove, onOpen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  /* The server denormalises what this row draws onto the line itself, and for
     the reason this component demonstrates: a line whose product has since
     been delisted still has to render as something the customer can identify
     well enough to remove. `line.product` was the local basket's nested copy
     and is not sent; these fields are. */
  const product = {
    /* `null` rather than `''`, so the "no longer listed" fallback below is
       reached — `??` does not treat an empty string as missing. */
    name: line.name || null,
    images: line.image ? [line.image] : [],
    stock: line.stock,
    minQty: line.minQty,
    maxQty: line.maxQty,
  };

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 12,
          padding: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: line.problem ? colors.saffron100 : colors.line,
        },
        shadow.xs,
      ]}
    >
      <Pressable accessibilityRole="link" onPress={onOpen}>
        {product?.images?.[0] ? (
          <Image
            source={{ uri: product.images[0] }}
            contentFit="cover"
            transition={200}
            style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: colors.sunken }}
          />
        ) : (
          <Placeholder
            name={product?.name}
            height={62}
            radius={18}
            style={{ width: 62 }}
          />
        )}
      </Pressable>

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text
            numberOfLines={2}
            style={{
              flex: 1,
              fontFamily: font.uiSemi,
              fontSize: type.sm + 2,
              color: colors.text,
            }}
          >
            {product?.name ?? t('That product is no longer listed.')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Remove')}
            onPress={onRemove}
            hitSlop={8}
          >
            <Icon name="x" size={15} color={colors.textLight} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {line.option ? (
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {line.option}
            </Text>
          ) : null}
          {line.preorder ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 2,
                paddingHorizontal: 7,
                borderRadius: radius.pill,
                backgroundColor: colors.saffron50,
              }}
            >
              <Icon name="clock" size={9} color={colors.saffron} />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 9,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: colors.saffron,
                }}
              >
                {t('Pre-order')}
              </Text>
            </View>
          ) : null}
        </View>

        {line.problem ? (
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.xs,
              lineHeight: type.xs * 1.5,
              color: colors.saffron,
            }}
          >
            {errorText(line.problem, t, n, {
              productName: product?.name,
              stock: product?.stock,
              max: product?.maxQty,
            })}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
          <QtyStepper
            small
            value={line.qty}
            min={product?.minQty ?? 1}
            max={product?.maxQty ?? null}
            onChange={onQty}
          />
          <Text
            style={{
              flex: 1,
              textAlign: 'right',
              fontFamily: font.uiBold,
              fontSize: type.sm + 2,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            ৳{n(line.lineTotal)}
          </Text>
        </View>
      </View>
    </View>
  );
}
