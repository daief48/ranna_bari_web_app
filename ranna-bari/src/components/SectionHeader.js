import React from 'react';
import { View } from 'react-native';

import { Body, GradientText, SectionTitle } from './Typography';
import useResponsive from '../theme/useResponsive';
import { useLang } from '../i18n/LanguageContext';
import { font, type } from '../theme/tokens';

/**
 * `.section-header` at the phone breakpoint: a left-aligned column, 20px gap,
 * 32px bottom margin, with the subtitle at 15px.
 *
 * `lead` is the plain half of the title and `accent` the gradient half --
 * "FEATURED" + "CHEFS", "DISCOVER" + "ARTISANS", and so on.
 */
export default function SectionHeader({
  lead,
  accent,
  trail,
  subtitle,
  center,
  small,
  right,
  style,
}) {
  const r = useResponsive();
  /* This is the one component that builds a font style without reading the
     theme, so it has to subscribe to the language itself or its title would
     keep the old typeface after a switch. */
  useLang();
  const size = small ? type.h2sm : r.sectionTitle;
  const titleStyle = {
    fontFamily: font.displayExtra,
    fontSize: size,
    lineHeight: size * 1.08,
    letterSpacing: size * -0.012,
  };

  return (
    <View
      style={[
        {
          gap: 20,
          marginBottom: 32,
          alignItems: center ? 'center' : 'flex-start',
        },
        style,
      ]}
    >
      <View style={{ alignItems: center ? 'center' : 'flex-start' }}>
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: center ? 'center' : 'flex-start',
          }}
        >
          <SectionTitle small={small} style={titleStyle}>
            {lead}
            {accent ? ' ' : ''}
          </SectionTitle>
          {accent ? <GradientText style={titleStyle}>{accent}</GradientText> : null}
          {trail ? (
            <SectionTitle small={small} style={titleStyle}>
              {' '}
              {trail}
            </SectionTitle>
          ) : null}
        </View>

        {subtitle ? (
          <Body
            muted
            size={15}
            style={{ marginTop: 6, textAlign: center ? 'center' : 'left' }}
          >
            {subtitle}
          </Body>
        ) : null}
      </View>

      {right}
    </View>
  );
}
