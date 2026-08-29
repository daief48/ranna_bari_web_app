/**
 * The app's one way of saying something went wrong.
 *
 * Every screen used to write its own refusal into a `FormNote` somewhere
 * below the fold, which is where a message goes to be missed — a customer who
 * taps "Confirm" and sees nothing move assumes the button is broken, not that
 * a sentence appeared 400px down the page.
 *
 * So a refusal comes to the front instead. One card, centred, over a scrim,
 * dismissable by the button or by the backdrop. It is deliberately not a
 * toast: the errors this shows are answers to something the person just
 * pressed, and an answer that fades out on its own can be missed the same way
 * an inline note can. Successes *are* toasts, because nobody needs to
 * acknowledge good news.
 *
 * Usage, from any screen:
 *
 *   const alert = useAlert();
 *   alert.error(errorText(out.error, t, n, out));
 *   alert.success(t('৳{n} added to your wallet.', { n: n(out.result) }));
 *   alert.confirm({ title, body, confirmLabel, onConfirm });
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  FadeInDown,
  FadeOutUp,
  ZoomIn,
} from 'react-native-reanimated';

import Icon from './Icon';
import Button from './Button';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

const AlertContext = createContext(null);

/** How long a success sits there before it takes itself away. */
const TOAST_MS = 3200;

/* ------------------------------------------------------------------ *
 * the look of each kind
 * ------------------------------------------------------------------ */

function toneOf(kind, colors) {
  switch (kind) {
    case 'success':
      return { icon: 'check', tint: colors.sage, wash: colors.sage50 };
    case 'warning':
      return { icon: 'alertCircle', tint: colors.saffron, wash: colors.saffron100 };
    case 'confirm':
      return { icon: 'alertCircle', tint: colors.primary, wash: colors.primary100 };
    default:
      return { icon: 'alertCircle', tint: colors.primary, wash: colors.primary100 };
  }
}

/* ------------------------------------------------------------------ *
 * provider
 * ------------------------------------------------------------------ */

export function AlertProvider({ children }) {
  /* Two slots, not one queue. A success toast and a blocking dialog are
     different things in different places on the screen, and a refusal must
     never have to wait behind a "saved!" that is still fading. */
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);

  const timer = useRef(null);

  useEffect(() => () => clearTimeout(timer.current), []);

  const dismiss = useCallback(() => setDialog(null), []);

  const show = useCallback((next) => setDialog({ id: Date.now(), ...next }), []);

  const success = useCallback((body, title) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), kind: 'success', title, body });
    timer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const value = useMemo(
    () => ({
      /** A refusal. Blocks until acknowledged, because it answers a tap. */
      error: (body, title) => show({ kind: 'error', body, title }),
      warning: (body, title) => show({ kind: 'warning', body, title }),
      /** Good news. Fades on its own; nobody needs to dismiss it. */
      success,
      /** A question with a destructive answer. `onConfirm` may be async. */
      confirm: ({ title, body, confirmLabel, cancelLabel, danger, onConfirm }) =>
        show({ kind: 'confirm', title, body, confirmLabel, cancelLabel, danger, onConfirm }),
      dismiss,
    }),
    [show, success, dismiss],
  );

  return (
    <AlertContext.Provider value={value}>
      {children}
      <Dialog spec={dialog} onClose={dismiss} />
      <Toast spec={toast} onClose={() => setToast(null)} />
    </AlertContext.Provider>
  );
}

export function useAlert() {
  const ctx = useContext(AlertContext);
  if (!ctx) throw new Error('useAlert must be used inside <AlertProvider>');
  return ctx;
}

/* ------------------------------------------------------------------ *
 * the dialog
 * ------------------------------------------------------------------ */

function Dialog({ spec, onClose }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();
  const [busy, setBusy] = useState(false);

  if (!spec) return null;

  const tone = toneOf(spec.kind, colors);
  const isConfirm = spec.kind === 'confirm';

  const run = async () => {
    if (!spec.onConfirm) return onClose();
    setBusy(true);
    try {
      await spec.onConfirm();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      transparent
      visible
      animationType="none"
      /* Android's own back gesture has to close it, or the dialog becomes a
         trap on the one platform with a system-level way out. */
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View
        entering={FadeIn.duration(160)}
        exiting={FadeOut.duration(140)}
        style={{
          flex: 1,
          backgroundColor: 'rgba(16, 12, 10, 0.52)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 24,
        }}
      >
        {/* The scrim dismisses, but never a confirm: walking away from a
            question by tapping beside it should not count as an answer. */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Close')}
          onPress={isConfirm ? undefined : onClose}
          style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }}
        />

        <Animated.View
          entering={ZoomIn.springify().damping(18).mass(0.6)}
          style={[
            {
              width: '100%',
              maxWidth: 380,
              padding: 24,
              borderRadius: radius.lg,
              backgroundColor: colors.surfaceSolid,
              borderWidth: 1,
              borderColor: colors.line,
              alignItems: 'center',
              gap: 14,
            },
            shadow.lg,
          ]}
        >
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 28,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: tone.wash,
            }}
          >
            <Icon name={tone.icon} size={26} color={tone.tint} />
          </View>

          <Text
            style={{
              fontFamily: font.displayExtra,
              fontSize: 21,
              lineHeight: 26,
              letterSpacing: -0.4,
              color: colors.text,
              textAlign: 'center',
            }}
          >
            {spec.title ?? (spec.kind === 'confirm' ? t('Are you sure?') : t('That did not work'))}
          </Text>

          {spec.body ? (
            <Text
              style={{
                fontFamily: font.ui,
                fontSize: 14.5,
                lineHeight: 22,
                color: colors.textMuted,
                textAlign: 'center',
              }}
            >
              {spec.body}
            </Text>
          ) : null}

          <View style={{ width: '100%', gap: 10, marginTop: 6 }}>
            <Button
              label={
                busy
                  ? t('Just a moment…')
                  : (spec.confirmLabel ?? (isConfirm ? t('Yes, continue') : t('Got it')))
              }
              block
              disabled={busy}
              onPress={isConfirm ? run : onClose}
            />
            {isConfirm ? (
              <Button
                label={spec.cancelLabel ?? t('Cancel')}
                variant="ghost"
                block
                disabled={busy}
                onPress={onClose}
              />
            ) : null}
          </View>
        </Animated.View>
      </Animated.View>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * the toast
 * ------------------------------------------------------------------ */

function Toast({ spec, onClose }) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  if (!spec) return null;
  const tone = toneOf(spec.kind, colors);

  return (
    <Animated.View
      key={spec.id}
      entering={FadeInDown.duration(240)}
      exiting={FadeOutUp.duration(200)}
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        top: Platform.OS === 'web' ? 20 : 56,
        left: 16,
        right: 16,
        alignItems: 'center',
        zIndex: 900,
      }}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Close')}
        onPress={onClose}
        style={[
          {
            flexDirection: 'row',
            alignItems: 'center',
            gap: 11,
            maxWidth: 420,
            paddingVertical: 13,
            paddingHorizontal: 16,
            borderRadius: radius.md,
            backgroundColor: colors.surfaceSolid,
            borderWidth: 1,
            borderColor: colors.line,
          },
          shadow.md,
        ]}
      >
        <View
          style={{
            width: 26,
            height: 26,
            borderRadius: 13,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: tone.wash,
          }}
        >
          <Icon name={tone.icon} size={14} color={tone.tint} />
        </View>
        <Text
          style={{
            flex: 1,
            fontFamily: font.uiSemi,
            fontSize: type.sm,
            lineHeight: 20,
            color: colors.text,
          }}
        >
          {spec.body}
        </Text>
      </Pressable>
    </Animated.View>
  );
}
