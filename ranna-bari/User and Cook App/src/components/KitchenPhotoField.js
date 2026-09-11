import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';

import { fitGallery, toStorableImages } from '../lib/pickedImage';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';

/**
 * One photograph of the kitchen.
 *
 * Shown as the wide banner it will become on the kitchen's card, and cropped
 * to that shape at pick time rather than letting the card do it later — a cook
 * choosing the picture should see what customers will see.
 *
 * At least one is required — it is the only evidence on this form about where
 * the food is actually cooked, and an operator cannot approve a kitchen
 * without seeing it.
 *
 * Refusing photo access still is not an error state: the field says what it
 * needs and the cook can grant access and come back. A permission dialog is
 * not a reason to throw away everything else they typed.
 *
 * Lives here rather than inside `app/auth.js` because two screens now collect
 * a kitchen gallery: registration no longer does, and the document step that
 * replaced it does — one gallery UX, one place to fix.
 */

/**
 * How many pictures a kitchen is registered with.
 *
 * Five is what the operator needs to approve a room and about as many as a
 * customer scrolls before deciding. It is also a size rule wearing a friendly
 * face: the gallery travels to the server in one request, and a ceiling the
 * cook can see is a better way to hold that line than a request that fails
 * once they are past it.
 */
export const MAX_KITCHEN_PHOTOS = 5;

export default function KitchenPhotoField({ value, onChange }) {
  const { colors } = useTheme();
  const { t, n } = useLang();
  const [note, setNote] = useState('');

  const photos = Array.isArray(value) ? value : [];

  const pick = async () => {
    const room = MAX_KITCHEN_PHOTOS - photos.length;
    if (room <= 0) {
      setNote(t('A kitchen shows up to {max} photos. Remove one to add another.', {
        max: n(MAX_KITCHEN_PHOTOS),
      }));
      return;
    }

    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setNote(t('RannaBari needs photo access to add a kitchen picture.'));
      return;
    }
    /* Multiple in one go, and no cropping: a gallery is a set of views of a
       room, and forcing each through a 3:1 crop would make every one of them
       a banner. The first is used as the banner and the card crops it there,
       where the shape is actually needed. */
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsMultipleSelection: true,
      /* These two are the fallback, not the mechanism. `toStorableImages`
         downscales and re-encodes every frame itself, at the size the
         gallery is actually drawn at — the picker only applies `quality`,
         which is why relying on it left full-resolution photographs in the
         kitchen document. They stay so a device whose manipulator refuses a
         picture still has bytes to offer rather than losing it. */
      quality: 0.6,
      base64: true,
    });
    if (res.canceled) return;

    setNote(t('Preparing your photos…'));

    /* Converted before they are stored, never after. The picker's `uri` is a
       blob handle that dies with this tab — see `toStorableImages`. */
    const { images, failed } = await toStorableImages(res.assets, 'gallery');
    if (!images.length) {
      setNote(t('Those photos could not be read. Please try different ones.'));
      return;
    }

    /* Appended, and de-duplicated: opening the picker twice and tapping the
       same photograph should not put it in the list twice. */
    const fresh = images.filter((uri) => !photos.includes(uri));
    /* Counted before the slice, so the ones over the ceiling can be spoken
       about rather than just vanishing off the end. */
    const overflow = Math.max(0, fresh.length - room);

    /* The whole gallery is posted in one request, so the budget is over the
       whole gallery — not over this batch. */
    const { images: next, dropped } = fitGallery([...photos, ...fresh.slice(0, room)]);
    onChange(next);

    /*
     * And if anything was lost, say so.
     *
     * This is the entire bug the gallery had: photographs that could not be
     * converted were dropped and the count never mentioned again, so a cook
     * who picked five and got two had no way to know it had happened, let
     * alone why. A number that does not match what they chose has to be
     * spoken out loud.
     */
    const lost = failed + dropped;
    setNote(
      /* The ceiling first when both apply: it is the deliberate rule, and a
         cook who picked eight needs to hear about the limit before they hear
         about a photograph that would not encode. */
      overflow
        ? t('A kitchen shows up to {max} photos, so {over} were not added.', {
            max: n(MAX_KITCHEN_PHOTOS),
            over: n(overflow),
          })
        : lost
          ? t('{lost} could not be added, so your gallery has {kept}. Try smaller photos.', {
              lost: n(lost),
              kept: n(next.length),
            })
          : '',
    );
  };

  const removeAt = (index) => onChange(photos.filter((_, i) => i !== index));

  return (
    <View style={{ marginTop: 14 }}>
      {photos.length === 0 ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Add photos of your kitchen')}
          onPress={pick}
          style={({ pressed }) => ({
            height: 104,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: colors.primary200,
            backgroundColor: colors.sunken,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name="chefHat" size={22} color={colors.primary} />
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.textMuted }}>
            {t('Add photos of your kitchen')}
          </Text>
        </Pressable>
      ) : (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {photos.map((uri, i) => (
            <View key={uri} style={{ width: 92, height: 92 }}>
              <Image
                source={{ uri }}
                contentFit="cover"
                style={{
                  width: '100%',
                  height: '100%',
                  borderRadius: radius.xs,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              />
              {/* The first is the banner, and saying so is the difference
                  between an ordered list and an arbitrary one. */}
              {i === 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    left: 4,
                    bottom: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: radius.pill,
                    backgroundColor: colors.primary,
                  }}
                >
                  <Text
                    style={{ fontFamily: font.uiBold, fontSize: 9, color: colors.onPrimary }}
                  >
                    {t('COVER')}
                  </Text>
                </View>
              ) : null}
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={t('Remove this photo')}
                onPress={() => removeAt(i)}
                hitSlop={8}
                style={{
                  position: 'absolute',
                  top: -6,
                  right: -6,
                  width: 22,
                  height: 22,
                  borderRadius: 11,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: colors.surfaceSolid,
                  borderWidth: 1,
                  borderColor: colors.line,
                }}
              >
                <Icon name="x" size={12} color={colors.textMuted} />
              </Pressable>
            </View>
          ))}

          {/* Gone at the ceiling rather than disabled: a tile that is still
              there and does nothing reads as a broken button, and the count
              below already says why it left. */}
          {photos.length < MAX_KITCHEN_PHOTOS ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Add more photos')}
            onPress={pick}
            style={({ pressed }) => ({
              width: 92,
              height: 92,
              borderRadius: radius.xs,
              borderWidth: 1,
              borderStyle: 'dashed',
              borderColor: colors.primary200,
              backgroundColor: colors.sunken,
              alignItems: 'center',
              justifyContent: 'center',
              opacity: pressed ? 0.85 : 1,
            })}
          >
            <Icon name="plus" size={20} color={colors.primary} />
          </Pressable>
          ) : null}
        </View>
      )}

      {photos.length ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: type.xs,
            color: colors.textLight,
          }}
        >
          {t('{n} of {max} · the first one is your cover', {
            n: n(photos.length),
            max: n(MAX_KITCHEN_PHOTOS),
          })}
        </Text>
      ) : null}

      {note ? (
        <Text
          style={{
            marginTop: 8,
            fontFamily: font.ui,
            fontSize: type.xs,
            color: colors.textMuted,
          }}
        >
          {note}
        </Text>
      ) : null}
    </View>
  );
}
