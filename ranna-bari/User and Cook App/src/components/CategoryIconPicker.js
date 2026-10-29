import React, { useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';

import Icon from './Icon';
import CategoryIcon from './CategoryIcon';
import { useAlert } from './Alert';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { toStorableImage } from '../lib/pickedImage';

/** Ready-made icons, for a shelf that does not need anything of its own. */
export const EMOJI = ['🎂', '🥮', '🫙', '🍪', '🍰', '🍛', '🎁', '🍞', '🍯', '🥧', '🍮', '🧁'];

/** Longest a typed icon may be, in characters a person sees — a family emoji is several. */
const MAX_TYPED = 8;

/**
 * Choose a shelf's icon: one of the ready-made emoji, any emoji or letter the
 * cook types, or a picture they upload.
 *
 * A shelf has one icon, so the three are exclusive — picking one clears the
 * others. The picture is cropped square and shrunk to icon size on the device
 * (a few KB), so it can travel inside every shop's category list.
 *
 * @param {object} props
 * @param {string} props.emoji
 * @param {string} props.image
 * @param {(next: {emoji: string, image: string}) => void} props.onChange
 */
export default function CategoryIconPicker({ emoji = '', image = '', onChange }) {
  const { colors } = useTheme();
  const { t } = useLang();
  const alert = useAlert();
  const [busy, setBusy] = useState(false);

  const custom = emoji && !EMOJI.includes(emoji) ? emoji : '';

  const upload = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      alert.error(t('RannaBari needs photo access to set an icon.'));
      return;
    }
    const res = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
      base64: true,
    });
    if (res.canceled || !res.assets?.[0]) return;

    setBusy(true);
    const stored = await toStorableImage(res.assets[0], 'icon');
    setBusy(false);
    if (!stored) {
      alert.error(t('That photo could not be read. Please try another.'));
      return;
    }
    onChange({ emoji: '', image: stored });
  };

  /* Code points, not UTF-16 units: slicing a string in the middle of an emoji
     leaves half of one, which renders as a box. */
  const typed = (text) => {
    const trimmed = Array.from(String(text ?? '').trim()).slice(0, MAX_TYPED).join('');
    onChange({ emoji: trimmed, image: '' });
  };

  const tile = (active) => ({
    width: 40,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
    backgroundColor: active ? colors.sage50 : colors.sunken,
    borderWidth: 1,
    borderColor: active ? colors.sage : colors.line,
  });

  return (
    <View style={{ gap: 12 }}>
      {/* ---- what is chosen, and the picture option beside it ---- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 56,
            height: 56,
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: radius.md,
            backgroundColor: colors.sage50,
            borderWidth: 1,
            borderColor: colors.sage,
          }}
        >
          <CategoryIcon category={{ emoji, image }} size={36} fallback="•" />
        </View>

        <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Upload image')}
            disabled={busy}
            onPress={upload}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingVertical: 9,
              paddingHorizontal: 14,
              borderRadius: radius.pill,
              backgroundColor: colors.sage,
              opacity: busy ? 0.6 : 1,
              transform: [{ scale: pressed ? 0.97 : 1 }],
            })}
          >
            <Icon name="plus" size={14} color="#FFFFFF" strokeWidth={2.6} />
            <Text style={{ fontFamily: font.uiBold, fontSize: 12.5, color: '#FFFFFF' }}>
              {busy ? t('Preparing the photo…') : image ? t('Change image') : t('Upload image')}
            </Text>
          </Pressable>

          {image ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Remove image')}
              onPress={() => onChange({ emoji: '', image: '' })}
              style={({ pressed }) => ({
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 9,
                paddingHorizontal: 14,
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: colors.line,
                backgroundColor: colors.surfaceSolid,
                transform: [{ scale: pressed ? 0.97 : 1 }],
              })}
            >
              <Icon name="x" size={13} color={colors.textMuted} strokeWidth={2.4} />
              <Text style={{ fontFamily: font.uiSemi, fontSize: 12.5, color: colors.textMuted }}>
                {t('Remove image')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {/* ---- ready-made ---- */}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {EMOJI.map((e) => {
          const active = !image && emoji === e;
          return (
            <Pressable
              key={e}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              accessibilityLabel={`${t('Icon')} ${e}`}
              onPress={() => onChange({ emoji: e, image: '' })}
              style={tile(active)}
            >
              <Text style={{ fontSize: 18 }}>{e}</Text>
            </Pressable>
          );
        })}
      </View>

      {/* ---- their own ---- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.textMuted }}>
          {t('Or type your own')}
        </Text>
        <TextInput
          value={image ? '' : custom}
          onChangeText={typed}
          placeholder="🥭"
          placeholderTextColor={colors.textLight}
          accessibilityLabel={t('Type your own icon')}
          autoCorrect={false}
          style={{
            width: 72,
            textAlign: 'center',
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: custom && !image ? colors.sage : colors.line,
            backgroundColor: colors.surfaceSolid,
            color: colors.text,
            fontSize: 18,
          }}
        />
      </View>
    </View>
  );
}
