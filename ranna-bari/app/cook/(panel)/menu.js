import React from 'react';
import { Pressable, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';

import CookScreen from '../../../src/components/CookScreen';
import { Container } from '../../../src/components/Screen';
import Icon from '../../../src/components/Icon';
import Reveal from '../../../src/components/Reveal';
import Button from '../../../src/components/Button';
import SectionHeader from '../../../src/components/SectionHeader';
import { IconTile, Tag } from '../../../src/components/Surfaces';
import { Body, Heading, Price } from '../../../src/components/Typography';
import { useTheme } from '../../../src/theme/ThemeProvider';
import { font, radius, type } from '../../../src/theme/tokens';
import { useKitchen } from '../../../src/store/KitchenContext';

export default function CookMenu() {
  const { colors } = useTheme();
  const router = useRouter();
  const { kitchen, liveDishes, toggleDish } = useKitchen();

  const dishes = kitchen?.dishes ?? [];

  return (
    <CookScreen>
      <Container>
        <SectionHeader
          lead="YOUR"
          accent="MENU"
          subtitle={
            dishes.length
              ? `${liveDishes.length} of ${dishes.length} available to order right now.`
              : 'Nothing listed yet. Add your first dish.'
          }
        />

        <Reveal delay={1}>
          <Button
            label="Add a dish"
            icon="plus"
            iconPosition="left"
            block
            onPress={() => router.push('/cook/dish/new')}
          />
        </Reveal>

        {/* A closed kitchen hides the whole menu from customers, which is not
            obvious from a screen full of dishes marked available. */}
        {kitchen && !kitchen.isOpen && dishes.length ? (
          <Reveal delay={2}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 10,
                padding: 14,
                marginTop: 16,
                borderRadius: radius.sm,
                backgroundColor: colors.saffron50,
                borderWidth: 1,
                borderColor: colors.saffron100,
              }}
            >
              <Icon name="alertCircle" size={17} color={colors.saffron} />
              <Text
                style={{
                  flex: 1,
                  fontFamily: font.ui,
                  fontSize: type.sm,
                  lineHeight: 21,
                  color: colors.text,
                }}
              >
                Your kitchen is closed, so none of this is orderable. Open it
                from the bar above.
              </Text>
            </View>
          </Reveal>
        ) : null}

        {!dishes.length ? (
          <View style={{ alignItems: 'center', gap: 16, paddingVertical: 44 }}>
            <IconTile name="utensils" variant="sage" large />
            <Heading size={19}>An empty menu</Heading>
            <Body muted size={14} style={{ textAlign: 'center' }}>
              A kitchen with nothing listed cannot take an order. Add a dish
              and it goes live the moment you open.
            </Body>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 20 }}>
            {dishes.map((dish, i) => (
              <Reveal key={dish.id} delay={(i % 5) + 1}>
                <DishRow
                  dish={dish}
                  onOpen={() => router.push(`/cook/dish/${dish.id}`)}
                  onToggle={() => {
                    Haptics.selectionAsync().catch(() => {});
                    toggleDish(dish.id);
                  }}
                />
              </Reveal>
            ))}
          </View>
        )}
      </Container>
    </CookScreen>
  );
}

/**
 * One dish.
 *
 * The availability switch is the whole reason this row is not just a link:
 * running out of fish at 8pm is the most common thing a cook has to tell the
 * app, and it should never cost more than one tap.
 */
function DishRow({ dish, onOpen, onToggle }) {
  const { colors, shadow } = useTheme();
  const on = dish.available;

  return (
    <View
      style={[
        {
          borderRadius: radius.lg,
          backgroundColor: colors.surfaceSolid,
          borderWidth: 1,
          borderColor: colors.line,
          overflow: 'hidden',
          // Sold out reads as dimmed, so the live menu is scannable at a glance.
          opacity: on ? 1 : 0.62,
        },
        shadow.sm,
      ]}
    >
      <Pressable
        accessibilityRole="link"
        accessibilityLabel={`Edit ${dish.name}, ৳${dish.price}`}
        onPress={onOpen}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 14,
          padding: 14,
          backgroundColor: pressed ? colors.sunken : 'transparent',
        })}
      >
        <Image
          source={{ uri: dish.image }}
          contentFit="cover"
          transition={200}
          style={{
            width: 62,
            height: 62,
            borderRadius: 18,
            backgroundColor: colors.sunken,
          }}
        />

        <View style={{ flex: 1, minWidth: 0 }}>
          <Text
            numberOfLines={1}
            style={{
              fontFamily: font.displayBold,
              fontSize: 16,
              letterSpacing: -0.16,
              color: colors.text,
            }}
          >
            {dish.name}
          </Text>
          <Text
            numberOfLines={1}
            style={{
              marginTop: 1,
              fontFamily: font.ui,
              fontSize: type.xs,
              color: colors.textMuted,
            }}
          >
            {dish.description}
          </Text>
          <View
            style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 7 }}
          >
            <Price size={16}>৳{dish.price}</Price>
            {dish.tags?.[0] ? <Tag label={dish.tags[0]} /> : null}
          </View>
        </View>

        <Icon name="chevronRight" size={17} color={colors.textLight} strokeWidth={2} />
      </Pressable>

      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: on }}
        accessibilityLabel={
          on
            ? `${dish.name} is available. Tap to mark sold out.`
            : `${dish.name} is sold out. Tap to make it available.`
        }
        onPress={onToggle}
        style={({ pressed }) => ({
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 14,
          paddingVertical: 12,
          borderTopWidth: 1,
          borderTopColor: colors.line2,
          backgroundColor: pressed ? colors.sunken : 'transparent',
        })}
      >
        <Text
          style={{
            flex: 1,
            fontFamily: font.uiSemi,
            fontSize: type.sm,
            color: on ? colors.sage : colors.textMuted,
          }}
        >
          {on ? 'Available today' : 'Sold out'}
        </Text>

        <View
          style={{
            width: 44,
            height: 26,
            borderRadius: 13,
            padding: 3,
            justifyContent: 'center',
            alignItems: on ? 'flex-end' : 'flex-start',
            backgroundColor: on ? colors.sage : colors.line,
          }}
        >
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 10,
              backgroundColor: colors.raised,
            }}
          />
        </View>
      </Pressable>
    </View>
  );
}
