import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';

import Icon from './Icon';
import { QtyStepper, Placeholder } from './StoreBits';
import { useTheme } from '../theme/ThemeProvider';
import { useLang } from '../i18n/LanguageContext';
import { font, radius, type } from '../theme/tokens';
import { errorText } from '../lib/errors';

/**
 * One shop product in the cart.
 *
 * The server denormalises what a row draws onto the line itself — name, first
 * image, stock and the quantity limits — because a product that has since
 * been delisted still has to render as something the customer can identify
 * well enough to remove.
 *
 * A line that has gone wrong keeps its quantity control and gains a reason,
 * rather than being dropped for you: someone who put four jars in the cart
 * should be told there are two left, not silently given two.
 *
 * `busy` is a round trip to the server in flight for this line. The controls
 * stay on screen but stop answering, so a second tap cannot ask for a
 * quantity the first has not finished setting.
 *
 * @param {object} props
 * @param {object} props.line      A line from the server's priced cart.
 * @param {boolean} [props.busy]
 * @param {(qty: number) => void} props.onQty
 * @param {() => void} props.onRemove
 * @param {() => void} props.onOpen  Opens the product.
 */
export default function ShopCartLine({ line, busy = false, onQty, onRemove, onOpen }) {
  const { colors, shadow } = useTheme();
  const { t, n } = useLang();

  const name = line.name || null;
  const min = line.minQty ?? 1;
  /* The ceiling is the cook's own limit, or — for something on the shelf rather
     than made to order — what is physically left. */
  const max = line.maxQty ?? (line.availability === 'in-stock' ? line.stock : null);

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          gap: 12,
          padding: 12,
          marginBottom: 12,
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: line.problem ? colors.saffron100 : colors.line,
        },
        shadow.xs,
      ]}
    >
      <Pressable accessibilityRole="link" onPress={onOpen}>
        {line.image ? (
          <Image
            source={{ uri: line.image }}
            contentFit="cover"
            transition={200}
            style={{ width: 62, height: 62, borderRadius: 18, backgroundColor: colors.sunken }}
          />
        ) : (
          <Placeholder name={name} height={62} radius={18} style={{ width: 62 }} />
        )}
      </Pressable>

      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Text
            numberOfLines={2}
            style={{ flex: 1, fontFamily: font.uiSemi, fontSize: type.sm + 2, color: colors.text }}
          >
            {name ?? t('That product is no longer listed.')}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${t('Remove')} ${name ?? ''}`.trim()}
            disabled={busy}
            onPress={onRemove}
            hitSlop={8}
            style={{ opacity: busy ? 0.4 : 1 }}
          >
            <Icon name="x" size={15} color={colors.textLight} />
          </Pressable>
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          {line.option ? (
            <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
              {line.option}
            </Text>
          ) : null}
          <Text style={{ fontFamily: font.ui, fontSize: type.xs, color: colors.textMuted }}>
            ৳{n(line.unitPrice)}
          </Text>
          {line.preorder ? (
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingVertical: 2,
                paddingHorizontal: 7,
                borderRadius: radius.pill,
                backgroundColor: colors.saffron50,
              }}
            >
              <Icon name="clock" size={9} color={colors.saffron} />
              <Text
                style={{
                  fontFamily: font.uiBold,
                  fontSize: 9,
                  letterSpacing: 0.5,
                  textTransform: 'uppercase',
                  color: colors.saffron,
                }}
              >
                {t('Pre-order')}
              </Text>
            </View>
          ) : null}
        </View>

        {line.problem ? (
          <Text
            style={{
              fontFamily: font.uiSemi,
              fontSize: type.xs,
              lineHeight: type.xs * 1.5,
              color: colors.saffron,
            }}
          >
            {errorText(line.problem, t, n, {
              productName: name,
              stock: line.stock,
              max: line.maxQty,
            })}
          </Text>
        ) : null}

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 2 }}>
          <View pointerEvents={busy ? 'none' : 'auto'} style={{ opacity: busy ? 0.5 : 1 }}>
            <QtyStepper small value={line.qty} min={min} max={max} onChange={onQty} />
          </View>
          <Text
            style={{
              flex: 1,
              textAlign: 'right',
              fontFamily: font.uiBold,
              fontSize: type.sm + 2,
              color: colors.text,
              fontVariant: ['tabular-nums'],
            }}
          >
            ৳{n(line.lineTotal)}
          </Text>
        </View>
      </View>
    </View>
  );
}
