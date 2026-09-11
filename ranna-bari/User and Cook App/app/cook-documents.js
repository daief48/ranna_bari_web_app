import React, { useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';

import Screen, { Container } from '../src/components/Screen';
import Button from '../src/components/Button';
import { FormNote } from '../src/components/FloatLabelInput';
import KitchenPhotoField from '../src/components/KitchenPhotoField';
import DocumentField from '../src/components/DocumentField';
import { Heading } from '../src/components/Typography';
import { useTheme } from '../src/theme/ThemeProvider';
import { font, type } from '../src/theme/tokens';
import { useSession } from '../src/store/SessionContext';
import { useKitchen } from '../src/store/KitchenContext';
import { useAlert } from '../src/components/Alert';
import { useLang } from '../src/i18n/LanguageContext';
import { fetchCookDocuments, submitCookDocuments } from '../src/lib/cookAuth';
import { approxBytes, DOC_BUDGET_BYTES } from '../src/lib/pickedImage';
import { call } from '../src/lib/server';

/**
 * The document step — the part of applying a form cannot carry.
 *
 * Both faces of the NID, because one face proves half a person. An optional
 * portrait, because the badge is nicer with a face on it and nobody should
 * have to trade one to get the other. And the kitchen, because that is the
 * thing being approved. This used to live at the bottom of the registration
 * form; it moved here so the queue receives a complete application instead of
 * a name and a promise.
 *
 * A resume restores what already landed, byte for byte, so finishing a half-
 * done application means changing one file — not re-photographing an ID the
 * server is already holding.
 */

const kindLabel = (kind, t) =>
  ({
    'nid-front': t('National ID — front'),
    'nid-back': t('National ID — back'),
    'profile-pic': t('Profile photo'),
    'kitchen-photo': t('Kitchen photo'),
  })[kind] ?? kind;

export default function CookDocumentsScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const { t, n } = useLang();
  const alert = useAlert();
  const { token, hydrated } = useSession();
  const { reload } = useKitchen();

  const [nidFront, setNidFront] = useState(null);
  const [nidBack, setNidBack] = useState(null);
  const [profilePic, setProfilePic] = useState(null);
  const [kitchenPhotos, setKitchenPhotos] = useState([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  /* A half-finished application is filled in from what the server holds, so
     the cook only touches what they actually want to change. */
  useEffect(() => {
    if (!token) return;
    let alive = true;

    (async () => {
      const listed = await fetchCookDocuments(token);
      if (!alive || !listed.ok) return;

      const rows = listed.result?.documents ?? [];
      const bytesOf = await Promise.all(
        rows.map(async (row) => {
          const full = await call(`/kitchens/mine/documents/${row.id}`, { token });
          return full.ok ? { kind: row.kind, seq: row.seq ?? 0, data: full.result.data } : null;
        }),
      );

      const docs = bytesOf.filter(Boolean);
      if (!docs.length || !alive) return;

      const first = (kind) => docs.find((d) => d.kind === kind)?.data ?? null;
      setNidFront(first('nid-front'));
      setNidBack(first('nid-back'));
      setProfilePic(first('profile-pic'));
      setKitchenPhotos(
        docs
          .filter((d) => d.kind === 'kitchen-photo')
          .sort((a, b) => a.seq - b.seq)
          .map((d) => d.data),
      );
    })();

    return () => {
      alive = false;
    };
  }, [token]);

  /* The whole set travels in one request, so the budget is over the whole
     set. PDFs are the reason this can overflow: no manipulator shrinks one,
     so two generous scans and a gallery can outgrow what one request may
     carry — and the platform refuses the body before the server is ever
     asked. Better counted here than discovered there. */
  const usedBytes =
    approxBytes(nidFront) +
    approxBytes(nidBack) +
    approxBytes(profilePic) +
    kitchenPhotos.reduce((total, uri) => total + approxBytes(uri), 0);
  const overBudget = usedBytes > DOC_BUDGET_BYTES;

  const missing = [];
  if (!nidFront) missing.push(t('the front of your National ID'));
  if (!nidBack) missing.push(t('the back of your National ID'));
  if (!kitchenPhotos.length) missing.push(t('at least one photo of your kitchen'));

  const submit = async () => {
    if (missing.length) {
      setNote(t('Still needed: {list}.', { list: missing.join(', ') }));
      return;
    }
    if (overBudget) {
      setNote(t('That is too much to send at once — use a smaller PDF or fewer photos.'));
      return;
    }

    setBusy(true);
    try {
      const out = await submitCookDocuments(token, {
        nidFront,
        nidBack,
        ...(profilePic ? { profilePic } : {}),
        kitchenPhotos,
      });

      if (!out.ok) {
        setNote(out.message ?? t('We could not submit those documents.'));
        return;
      }

      /* The pending screen reads `documentsSubmittedAt` off the kitchen —
         reloading here is what makes the escape hatch disappear behind them
         instead of on the next cold start. */
      await reload().catch(() => {});
      alert.success(t('Documents submitted. We will check them and let you know.'));
      router.replace('/cook');
    } finally {
      setBusy(false);
    }
  };

  if (hydrated && !token) {
    return <Redirect href="/auth" />;
  }

  return (
    <Screen>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 48 }}
      >
        <Container style={{ maxWidth: 520, paddingTop: 32 }}>
          <Heading style={{ marginBottom: 6 }}>{t('Your documents.')}</Heading>
          <Text
            style={{
              fontFamily: font.ui,
              fontSize: 14.5,
              lineHeight: 22,
              color: colors.textMuted,
              marginBottom: 18,
            }}
          >
            {t(
              'Both sides of your National ID and a photo of your kitchen. An operator reads these to verify you — customers never see them.',
            )}
          </Text>

          <FormNote text={note} />

          <DocumentField
            label={t('Upload the front of your National ID')}
            hint={t('PDF or image, up to 2 MB')}
            value={nidFront}
            onChange={setNidFront}
          />
          <DocumentField
            label={t('Upload the back of your National ID')}
            hint={t('PDF or image, up to 2 MB')}
            value={nidBack}
            onChange={setNidBack}
          />
          <DocumentField
            label={t('Add a profile photo')}
            hint={t('Shown on your kitchen page, next to your name.')}
            value={profilePic}
            onChange={setProfilePic}
            accept="image"
            optional
          />

          <KitchenPhotoField value={kitchenPhotos} onChange={setKitchenPhotos} />

          <Text
            style={{
              marginTop: 10,
              fontFamily: font.ui,
              fontSize: type.xs,
              color: overBudget ? colors.primary : colors.textLight,
            }}
          >
            {t('{used} of {max} ready to send', {
              used: n(Math.round(usedBytes / 1024)),
              max: n(Math.round(DOC_BUDGET_BYTES / 1024)),
            })}
          </Text>

          <Button
            label={busy ? t('Submitting…') : t('Submit for verification')}
            icon="arrowRight"
            block
            disabled={busy}
            onPress={submit}
            style={{ marginTop: 20 }}
          />
        </Container>
      </ScrollView>
    </Screen>
  );
}
