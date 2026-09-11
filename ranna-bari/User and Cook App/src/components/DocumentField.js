import React, { useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as DocumentPicker from 'expo-document-picker';

import { approxBytes, toStorableImage } from '../lib/pickedImage';
import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';

/**
 * One document — a NID face, or an optional portrait.
 *
 * Deliberately not `KitchenPhotoField` bent to fit. That field is a *gallery*:
 * multiple, images only, a cover badge, a shrinking ladder. This is one file,
 * which may be a PDF, and a PDF cannot be shrunk — no manipulator reads one —
 * so its size is a gate, not a negotiation.
 *
 * The value is the data URI string itself, like every other picture in this
 * app: the mime lives in the header when something needs to know it, and the
 * field stays JSON all the way to the server.
 *
 * `expo-file-system` has no web build, so a PDF is read two ways: natively
 * through the SDK 57 `File` class, and on web through the `File` object the
 * picker itself hands back. Images go through `toStorableImage` on both —
 * the manipulator has a web build and a photographed NID wants the
 * downscale anyway.
 */

/** Two megabytes — the backend refuses past this, so ask first. */
export const MAX_DOCUMENT_BYTES = 2_000_000;

const MIME_HEADER = /^data:([a-z]+\/[a-z0-9.+-]+);base64,/i;

/** Read a picked PDF as a data URI, whichever platform this is. */
async function pdfToDataUri(asset) {
  if (Platform.OS === 'web') {
    const file = asset.file ?? null;
    if (!file) return null;
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
  }

  const { File } = await import('expo-file-system');
  const file = new File(asset.uri);
  const base64 = await file.base64();
  return base64 ? `data:application/pdf;base64,${base64}` : null;
}

const kb = (bytes) => `${Math.max(1, Math.round(bytes / 1024))} KB`;

export default function DocumentField({
  label,
  hint,
  value,
  onChange,
  accept = 'any', // 'any' (image or PDF) | 'image'
  optional = false,
  invalid = false,
}) {
  const { colors } = useTheme();
  const { t } = useLang();
  const [note, setNote] = useState('');

  const mime = MIME_HEADER.exec(value ?? '')?.[1]?.toLowerCase() ?? null;
  const isPdf = mime === 'application/pdf';
  const bytes = approxBytes(value);

  const pick = async () => {
    setNote('');

    const res = await DocumentPicker.getDocumentAsync({
      multiple: false,
      copyToCacheDirectory: true,
      type: accept === 'image' ? ['image/*'] : ['image/*', 'application/pdf'],
    });
    if (res.canceled || !res.assets?.length) return;

    const asset = res.assets[0];
    const kind = asset.mimeType ?? '';

    if (kind === 'application/pdf') {
      /* A PDF cannot be downscaled, so its size is checked before it is
         read — a ten-megabyte scan should be refused with a sentence, not
         encoded and then refused by the server. */
      if ((asset.size ?? 0) > MAX_DOCUMENT_BYTES) {
        setNote(t('That PDF is larger than 2 MB — photograph the card instead.'));
        return;
      }
      const dataUri = await pdfToDataUri(asset);
      if (!dataUri) {
        setNote(t('That file could not be read. Try again, or use a photo.'));
        return;
      }
      onChange(dataUri);
      return;
    }

    if (kind.startsWith('image/') || !kind) {
      const dataUri = await toStorableImage(asset, 'dish');
      if (!dataUri) {
        setNote(t('That file could not be read. Try again, or use a photo.'));
        return;
      }
      onChange(dataUri);
      return;
    }

    setNote(t('Use an image, or a PDF for the ID.'));
  };

  const clear = () => onChange(null);

  return (
    <View style={{ marginTop: 14 }}>
      {value ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 12,
            padding: 10,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderColor: colors.line,
            backgroundColor: colors.sunken,
          }}
        >
          {isPdf ? (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.xs,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.surfaceSolid,
                borderWidth: 1,
                borderColor: colors.line,
                gap: 3,
              }}
            >
              <Icon name="receipt" size={20} color={colors.primary} />
              <Text style={{ fontFamily: font.uiBold, fontSize: 9, color: colors.textMuted }}>
                PDF
              </Text>
            </View>
          ) : (
            <Image
              source={{ uri: value }}
              contentFit="cover"
              style={{
                width: 64,
                height: 64,
                borderRadius: radius.xs,
                borderWidth: 1,
                borderColor: colors.line,
              }}
            />
          )}

          <View style={{ flex: 1, gap: 3 }}>
            <Text
              numberOfLines={1}
              style={{ fontFamily: font.uiSemi, fontSize: 13.5, color: colors.text }}
            >
              {label}
            </Text>
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {isPdf
                ? t('PDF · {size}', { size: kb(bytes) })
                : t('Image · {size}', { size: kb(bytes) })}
            </Text>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Remove this file')}
            onPress={clear}
            hitSlop={8}
            style={{
              width: 30,
              height: 30,
              borderRadius: 15,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
            }}
          >
            <Icon name="x" size={13} color={colors.textMuted} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={pick}
          style={({ pressed }) => ({
            minHeight: 84,
            borderRadius: radius.sm,
            borderWidth: 1,
            borderStyle: 'dashed',
            borderColor: invalid ? colors.danger ?? colors.primary200 : colors.primary200,
            backgroundColor: colors.sunken,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 14,
            opacity: pressed ? 0.85 : 1,
          })}
        >
          <Icon name={isPdf ? 'receipt' : 'shieldCheck'} size={20} color={colors.primary} />
          <Text style={{ fontFamily: font.uiSemi, fontSize: type.xs, color: colors.textMuted }}>
            {label}
            {optional ? ` (${t('optional')})` : ''}
          </Text>
        </Pressable>
      )}

      {hint ? (
        <Text
          style={{
            marginTop: 6,
            fontFamily: font.ui,
            fontSize: type.xs,
            color: colors.textLight,
          }}
        >
          {hint}
        </Text>
      ) : null}

      {note ? (
        <Text
          style={{
            marginTop: 6,
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
