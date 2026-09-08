import React from 'react';
import { Text, View } from 'react-native';

import Icon from './Icon';
import Reveal from './Reveal';
import { ActionRow } from './CookBits';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius, tracking, type } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

/**
 * What is actually waiting on this person, on the screen they open first.
 *
 * Both halves of the app already say everything a newcomer needs — the cook
 * panel explains that a closed kitchen takes no orders, the customer home
 * has a "how it works" band — but they say it *where the thing lives*, which
 * is no use to somebody who does not yet know the thing exists. A cook whose
 * menu is empty reads "Add a dish" at the bottom of a screen they stopped
 * scrolling halfway down.
 *
 * So this is the same information, promoted and made conditional. Every row
 * is derived from real state, appears only while it is genuinely undone, and
 * disappears the moment it is done — including when somebody else does it.
 * There is no progress to store, nothing to dismiss, and it cannot be wrong
 * about what has already happened, which is the difference between this and
 * an onboarding flow.
 *
 * It renders nothing at all once there is nothing to say. A panel that sits
 * there congratulating somebody is a panel they learn to scroll past, and the
 * next time it has something urgent they will scroll past that too.
 */

/** Never more than this, however much is outstanding. */
const MOST = 4;

export default function NextUp({ steps, title, style, delay = 2 }) {
  const { colors } = useTheme();
  const { t, n } = useLang();

  /* Falsy entries are how a caller writes a conditional row inline, so they
     are filtered here rather than at every call site. */
  const live = (steps ?? []).filter(Boolean);

  /*
   * Nothing at all, rather than an empty box.
   *
   * This has to return `null` from the *outermost* element, which is why the
   * entrance animation is inside this component rather than wrapped around it
   * by the caller. A `<Reveal>` holding nothing is still a child, and the
   * customer home lays its sections out with `gap: 16` — so an empty one left
   * a sixteen-pixel hole under the hero for everybody who had nothing
   * outstanding, which is most people most of the time.
   */
  if (!live.length) return null;

  /*
   * Urgent first, and only the top few.
   *
   * A list of nine things is a list nobody reads. Four is about what somebody
   * scans before deciding the panel is noise, and anything that does not fit
   * is still reachable where it has always been — this promotes, it does not
   * replace.
   */
  const shown = [...live]
    .sort((a, b) => (b.urgent ? 1 : 0) - (a.urgent ? 1 : 0))
    .slice(0, MOST);

  const hidden = live.length - shown.length;

  return (
    <Reveal delay={delay} style={[{ gap: 10 }, style]}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Icon name="sparkles" size={15} color={colors.primary} />
        <Text
          style={{
            flex: 1,
            fontFamily: font.uiBold,
            fontSize: type.sm,
            letterSpacing: type.sm * tracking.label,
            textTransform: 'uppercase',
            color: colors.textMuted,
          }}
        >
          {title ?? t('Next up')}
        </Text>

        {live.length > 1 ? (
          <View
            style={{
              paddingVertical: 3,
              paddingHorizontal: 8,
              borderRadius: radius.pill,
              backgroundColor: colors.sunken,
            }}
          >
            <Text style={{ fontFamily: font.uiBold, fontSize: type.xs - 1, color: colors.textMuted }}>
              {n(live.length)}
            </Text>
          </View>
        ) : null}
      </View>

      {shown.map((step) => (
        <ActionRow
          key={step.key}
          icon={step.icon}
          title={step.title}
          sub={step.sub}
          tone={step.tone ?? 'primary'}
          onPress={step.onPress}
        />
      ))}

      {hidden > 0 ? (
        <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
          {t('and {n} more further down', { n: n(hidden) })}
        </Text>
      ) : null}
    </Reveal>
  );
}
