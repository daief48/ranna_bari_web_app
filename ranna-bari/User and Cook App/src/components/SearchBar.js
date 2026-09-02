/**
 * The app's search field, in one place.
 *
 * Browse had one, the map grew a second, and Meals and Shops — two whole
 * directories — had none at all, so the only way to find a shop by name was
 * to open the map and search there. This is Browse's bar lifted out
 * unchanged, so a fourth and fifth copy did not have to be typed.
 *
 * Filtering as the word is typed, rather than on submit: these two lists are
 * short enough that a round of `makeMatcher` costs nothing, and waiting for a
 * return key on a phone keyboard is a step nobody asked for.
 */
import React from 'react';
import { Pressable, TextInput, View } from 'react-native';

import Icon from './Icon';
import { useTheme } from '../theme/ThemeProvider';
import { font, radius } from '../theme/tokens';
import { useLang } from '../i18n/LanguageContext';

export default function SearchBar({
  value,
  onChange,
  placeholder,
  /** Announced to a screen reader, and used for the clear button's label. */
  label,
  style,
  ...rest
}) {
  const { colors, shadow } = useTheme();
  const { t } = useLang();

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          height: 52,
          paddingRight: 6,
          borderRadius: radius.pill,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
        },
        shadow.sm,
        style,
      ]}
    >
      <Icon name="search" size={18} color={colors.textMuted} style={{ marginLeft: 16 }} />

      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={colors.textLight}
        returnKeyType="search"
        accessibilityLabel={label ?? placeholder}
        style={{
          flex: 1,
          minWidth: 0,
          fontFamily: font.ui,
          fontSize: 16,
          color: colors.text,
          paddingHorizontal: 12,
        }}
        {...rest}
      />

      {value ? (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel={t('Clear search')}
          style={{ paddingHorizontal: 8 }}
        >
          <Icon name="x" size={16} color={colors.textMuted} />
        </Pressable>
      ) : null}
    </View>
  );
}
