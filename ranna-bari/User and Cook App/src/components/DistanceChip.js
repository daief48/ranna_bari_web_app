/**
 * How far away is this, and measured from where.
 *
 * A bare "6.1 km" on a card raises more questions than it answers: six
 * kilometres from what? From the phone, which is on a bus? From home? And is
 * that near enough for them to bring it? Those matter more here than in a
 * list, because this is the screen somebody orders from.
 *
 * So the number stays small and inline as it always was, but it is now a
 * button, and pressing it shows the whole answer: the two ends of the
 * journey, and whether the kitchen will actually make it.
 *
 * It renders on every detail page even when there is no address to measure
 * from — as a plain "Distance" prompt rather than a number. Hiding it in that
 * case is what the pages used to do, and it left the one customer who most
 * needs to set an address with nothing on screen to tell them so.
 */
import React, { useMemo, useState } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';
import { useAuth } from '../store/AuthContext';
import { useLang } from '../i18n/LanguageContext';
import { distanceKm, formatDistance } from '../lib/geo';
import { deliversTo } from '../lib/kitchen';

/** What sits at the far end, for the copy and the icon on the sheet. */
const KINDS = {
  /* A dish and a meal resolve to the kitchen that cooks them, exactly as they
     do on the map — so they carry the map's glyph for it. */
  dish: { icon: 'chefHat', label: 'Dish' },
  meal: { icon: 'pot', label: 'Meal' },
  shop: { icon: 'box', label: 'Shop' },
  product: { icon: 'box', label: 'Food' },
  kitchen: { icon: 'chefHat', label: 'Kitchen' },
};

export default function DistanceChip({ target, kind = 'dish', style }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();
  const router = useRouter();
  const { account } = useAuth();
  const [open, setOpen] = useState(false);

  const meta = KINDS[kind] ?? KINDS.dish;

  /*
   * Measured from the address on the account, not the device GPS — the same
   * origin browse and the directory use. It is where the food is going, and
   * it needs no permission prompt.
   */
  const origin = useMemo(() => {
    if (typeof account?.lat !== 'number' || typeof account?.lng !== 'number') return null;
    return { lat: account.lat, lng: account.lng };
  }, [account]);

  const km = useMemo(() => {
    if (!origin) return null;
    if (typeof target?.lat !== 'number' || typeof target?.lng !== 'number') return null;
    return distanceKm(origin, { lat: target.lat, lng: target.lng });
  }, [origin, target]);

  const away = formatDistance(km, t, n);

  /* Three states, and they are genuinely different: a number, "you have no
     address", and "this place has no pin on the map". */
  const reason = origin ? (km == null ? 'no-target' : null) : 'no-origin';

  const radiusKm = target?.deliveryRadiusKm;
  const willDeliver = km == null ? null : deliversTo(target, km);

  const myAddress = [account?.area, account?.addressDetail].filter(Boolean).join(' · ');

  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={
          away
            ? t('Distance: {d}. Tap for details.', { d: away })
            : t('Show how far away this is')
        }
        style={({ pressed }) => [
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingVertical: 3,
            paddingHorizontal: 8,
            borderRadius: radius.pill,
            backgroundColor: away ? colors.sage50 : colors.sunken,
            opacity: pressed ? 0.65 : 1,
          },
          style,
        ]}
      >
        <Icon name="route" size={10} color={away ? colors.sage : colors.textMuted} />
        <Text
          style={{
            fontFamily: font.uiBold,
            fontSize: 10,
            color: away ? colors.sage : colors.textMuted,
            fontVariant: ['tabular-nums'],
          }}
        >
          {away ?? t('Distance')}
        </Text>
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable
          onPress={() => setOpen(false)}
          style={{
            flex: 1,
            justifyContent: 'center',
            padding: 18,
            backgroundColor: 'rgba(20, 16, 14, 0.45)',
          }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={[
              {
                borderRadius: radius.md,
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
                overflow: 'hidden',
              },
              shadow.lg,
            ]}
          >
            {/* ---- header ---- */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
                paddingHorizontal: 16,
                paddingVertical: 13,
                borderBottomWidth: 1,
                borderBottomColor: colors.line2,
              }}
            >
              <Text
                style={{
                  flex: 1,
                  fontFamily: font.uiSemi,
                  fontSize: 11,
                  letterSpacing: 11 * tracking.label,
                  textTransform: 'uppercase',
                  color: colors.textMuted,
                }}
              >
                {t('Distance')}
              </Text>
              <Pressable
                onPress={() => setOpen(false)}
                hitSlop={10}
                accessibilityRole="button"
                accessibilityLabel={t('Close')}
              >
                <Icon name="x" size={16} color={colors.textMuted} />
              </Pressable>
            </View>

            {/* ---- the number, or why there isn't one ---- */}
            <View style={{ alignItems: 'center', paddingTop: 20, paddingHorizontal: 18 }}>
              <View
                style={{
                  width: 46,
                  height: 46,
                  borderRadius: 16,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: away ? colors.sage50 : colors.sunken,
                }}
              >
                <Icon
                  name={away ? 'route' : 'locate'}
                  size={21}
                  color={away ? colors.sage : colors.textMuted}
                />
              </View>

              <Text
                style={{
                  marginTop: 12,
                  fontFamily: font.display,
                  fontSize: away ? 32 : type.lg,
                  lineHeight: away ? 38 : type.lg * 1.4,
                  textAlign: 'center',
                  color: colors.text,
                  fontVariant: ['tabular-nums'],
                }}
              >
                {away ??
                  (reason === 'no-origin'
                    ? t('No address yet')
                    : t('Not on the map yet'))}
              </Text>

              <Text
                style={{
                  marginTop: 4,
                  fontFamily: font.ui,
                  fontSize: type.xs,
                  lineHeight: type.xs * 1.55,
                  textAlign: 'center',
                  color: colors.textMuted,
                }}
              >
                {reason === 'no-origin'
                  ? t('Add your delivery address and this will show how far away it is.')
                  : reason === 'no-target'
                    ? t('{name} has not pinned a location yet.', {
                        name: target?.name ?? t('This place'),
                      })
                    : t('in a straight line from your delivery address')}
              </Text>
            </View>

            {/* ---- the two ends of the journey ---- */}
            {away ? (
              <View style={{ paddingHorizontal: 18, paddingTop: 18 }}>
                <Leg
                  icon="home"
                  tone={colors.saffron}
                  bg={colors.saffron50}
                  label={t(account?.addressLabel || 'Your address')}
                  detail={myAddress}
                />
                {/* The thread between the two pins. */}
                <View
                  style={{
                    width: 1,
                    height: 14,
                    marginLeft: 15,
                    backgroundColor: colors.line,
                  }}
                />
                <Leg
                  icon={meta.icon}
                  tone={colors.sage}
                  bg={colors.sage50}
                  label={target?.name ?? t(meta.label)}
                  detail={target?.area}
                />
              </View>
            ) : null}

            {/* ---- will they come this far ---- */}
            {willDeliver != null && typeof radiusKm === 'number' && radiusKm > 0 ? (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  margin: 18,
                  marginBottom: 0,
                  padding: 11,
                  borderRadius: radius.sm,
                  backgroundColor: willDeliver ? colors.sage50 : colors.sunken,
                }}
              >
                <Icon
                  name={willDeliver ? 'check' : 'alertCircle'}
                  size={14}
                  color={willDeliver ? colors.sage : colors.textMuted}
                />
                <Text
                  style={{
                    flex: 1,
                    fontFamily: font.ui,
                    fontSize: type.xs,
                    lineHeight: type.xs * 1.5,
                    color: willDeliver ? colors.sage : colors.textMuted,
                  }}
                >
                  {willDeliver
                    ? t('Within their {r} km delivery range.', { r: n(radiusKm) })
                    : t('Outside their {r} km delivery range.', { r: n(radiusKm) })}
                </Text>
              </View>
            ) : null}

            {/* ---- what to do about it ---- */}
            <View style={{ flexDirection: 'row', gap: 9, padding: 18 }}>
              <Action
                label={reason === 'no-origin' ? t('Add address') : t('Change address')}
                icon="pin"
                filled={reason === 'no-origin'}
                onPress={() => {
                  setOpen(false);
                  router.push('/addresses');
                }}
              />
              <Action
                label={t('See on map')}
                icon="map"
                onPress={() => {
                  setOpen(false);
                  router.push('/map');
                }}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

/** One end of the journey. */
function Leg({ icon, tone, bg, label, detail }) {
  const { colors } = useTheme();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 31,
          height: 31,
          borderRadius: 11,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: bg,
        }}
      >
        <Icon name={icon} size={14} color={tone} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          numberOfLines={1}
          style={{ fontFamily: font.uiSemi, fontSize: type.sm, color: colors.text }}
        >
          {label}
        </Text>
        {detail ? (
          <Text
            numberOfLines={1}
            style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}
          >
            {detail}
          </Text>
        ) : null}
      </View>
    </View>
  );
}

function Action({ label, icon, onPress, filled }) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => ({
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        paddingVertical: 11,
        borderRadius: radius.sm,
        borderWidth: 1,
        borderColor: filled ? colors.primary : colors.line,
        backgroundColor: filled ? colors.primary : 'transparent',
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <Icon name={icon} size={13} color={filled ? colors.onPrimary : colors.text} />
      <Text
        numberOfLines={1}
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.xs,
          color: filled ? colors.onPrimary : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}
