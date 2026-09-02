/**
 * The shops, on their own screen.
 *
 * No longer in the tab bar — Browse carries a Shops segment now, and seven
 * destinations in a phone-width pill left each label about forty pixels. The
 * route stays, because every link to `/stores` and every shop card in the app
 * points through here, and because "who sells the achar" is still a different
 * errand from "what shall I eat tonight".
 *
 * The list itself lives in `ShopResults`, shared with Browse so the matching,
 * the delivery filter and the save-star cannot drift apart.
 */
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import Screen, { Container } from '../../src/components/Screen';
import Icon from '../../src/components/Icon';
import SectionHeader from '../../src/components/SectionHeader';
import SearchBar from '../../src/components/SearchBar';
import ShopResults from '../../src/components/ShopResults';
import { useTheme } from '../../src/theme/ThemeProvider';
import { font, radius, type } from '../../src/theme/tokens';
import { useLang } from '../../src/i18n/LanguageContext';

/** A filter that is either on or off, styled like the chips on Browse. */
function Chip({ on, onPress, label }) {
  const { colors } = useTheme();
  const { t } = useLang();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}${on ? `, ${t('on')}` : ''}`}
      style={({ pressed }) => ({
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: radius.pill,
        backgroundColor: on ? colors.primary : colors.surfaceSolid,
        borderWidth: 1,
        borderColor: on ? colors.primary : colors.line,
        opacity: pressed ? 0.75 : 1,
      })}
    >
      <Text
        style={{
          fontFamily: font.uiSemi,
          fontSize: type.xs,
          color: on ? colors.onPrimary : colors.text,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function StoresScreen() {
  const { colors } = useTheme();
  const { t } = useLang();
  const router = useRouter();

  const [query, setQuery] = useState('');
  const [openOnly, setOpenOnly] = useState(false);
  const [freeOnly, setFreeOnly] = useState(false);

  const clear = () => {
    setQuery('');
    setOpenOnly(false);
    setFreeOnly(false);
  };

  return (
    <Screen>
      <Container>
        <Pressable
          accessibilityRole="link"
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
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
          lead={t('HOME')}
          accent={t('SHOPS')}
          subtitle={t('Cakes, pitha, achar and everything else cooks make to keep.')}
          style={{ marginBottom: 22 }}
        />

        <SearchBar
          value={query}
          onChange={setQuery}
          placeholder={t('Search a shop or something they sell…')}
          style={{ marginBottom: 10 }}
        />

        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
          <Chip on={openOnly} onPress={() => setOpenOnly((v) => !v)} label={t('Open now')} />
          <Chip on={freeOnly} onPress={() => setFreeOnly((v) => !v)} label={t('Free delivery')} />
        </View>

        <ShopResults
          query={query}
          openOnly={openOnly}
          freeOnly={freeOnly}
          onClearFilters={clear}
        />
      </Container>
    </Screen>
  );
}
