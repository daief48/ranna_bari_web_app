import React, { useMemo } from 'react';
import {
  View, Text, ScrollView, Image, TouchableOpacity,
  StyleSheet, StatusBar, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import MenuItemCard from '../components/MenuItemCard';
import chefsData from '../data/chefs.json';
import menusData from '../data/menus.json';

const { width } = Dimensions.get('window');

export default function ChefScreen({ route, navigation }) {
  const { colors, isDark } = useTheme();
  const { chefId } = route.params;

  const chef = useMemo(() => chefsData.find((c) => c.id === chefId), [chefId]);
  const menuItems = useMemo(() => {
    const menu = menusData.find((m) => m.chefId === chefId);
    return menu ? menu.items : [];
  }, [chefId]);

  if (!chef) {
    return (
      <View style={[styles.container, { backgroundColor: colors.bg, justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: colors.textMuted }}>Chef not found.</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle="light-content" />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Cover Image */}
        <View style={styles.coverWrap}>
          <Image source={{ uri: chef.coverImage }} style={styles.coverImage} />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.7)']}
            style={styles.coverGradient}
          />
          <TouchableOpacity
            style={styles.backBtn}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>

        {/* Profile Info */}
        <View style={[styles.profileCard, { backgroundColor: colors.bg }]}>
          <Image source={{ uri: chef.avatar }} style={styles.avatar} />

          <View style={styles.nameRow}>
            <Text style={[styles.name, { color: colors.text }]}>{chef.name}</Text>
            {chef.isVerified && (
              <View style={[styles.topBadge, { backgroundColor: colors.primaryLight }]}>
                <Text style={[styles.topBadgeText, { color: colors.primary }]}>VERIFIED</Text>
              </View>
            )}
          </View>

          <Text style={[styles.specialty, { color: colors.primary }]}>
            {chef.specialty} • {chef.area}
          </Text>

          <Text style={[styles.description, { color: colors.textMuted }]}>
            {chef.description}
          </Text>

          {/* Stats Row */}
          <View style={[styles.statsRow, { borderColor: colors.border }]}>
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.text }]}>{chef.rating}</Text>
              <Text style={[styles.statLbl, { color: colors.textMuted }]}>RATING</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.text }]}>{chef.reviewCount}</Text>
              <Text style={[styles.statLbl, { color: colors.textMuted }]}>REVIEWS</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.stat}>
              <Text style={[styles.statVal, { color: colors.text }]}>{(chef.reviewCount * 6) + '+'}</Text>
              <Text style={[styles.statLbl, { color: colors.textMuted }]}>ORDERS</Text>
            </View>
          </View>

          {/* Badges */}
          <View style={styles.badges}>
            {chef.isVerified && (
              <View style={[styles.badge, { backgroundColor: 'rgba(107,143,113,0.12)' }]}>
                <Ionicons name="shield-checkmark" size={14} color={colors.sage} />
                <Text style={[styles.badgeText, { color: colors.sage }]}>Verified Clean</Text>
              </View>
            )}
            {chef.ecoBadge && (
              <View style={[styles.badge, { backgroundColor: 'rgba(107,143,113,0.12)' }]}>
                <Ionicons name="leaf" size={14} color={colors.sage} />
                <Text style={[styles.badgeText, { color: colors.sage }]}>{chef.ecoBadge}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Menu Items */}
        <View style={styles.menuSection}>
          <Text style={[styles.menuTitle, { color: colors.text }]}>
            CURATED <Text style={{ color: colors.primary }}>MENU</Text>
          </Text>
          {menuItems.map((item) => (
            <MenuItemCard key={item.id} item={item} />
          ))}
          {menuItems.length === 0 && (
            <Text style={[styles.noMenu, { color: colors.textMuted }]}>
              No menu items available yet.
            </Text>
          )}
        </View>

        <View style={{ height: 100 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  coverWrap: {
    height: 260,
    position: 'relative',
  },
  coverImage: {
    width: '100%',
    height: '100%',
  },
  coverGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 140,
  },
  backBtn: {
    position: 'absolute',
    top: 52,
    left: 20,
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileCard: {
    marginTop: -40,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: 24,
    borderWidth: 4,
    borderColor: '#FFF',
    marginBottom: 16,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 4,
  },
  name: {
    fontSize: 32,
    fontWeight: '900',
  },
  topBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  topBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  specialty: {
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 12,
  },
  description: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 20,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    marginBottom: 16,
  },
  stat: { alignItems: 'center' },
  statVal: { fontSize: 22, fontWeight: '900' },
  statLbl: { fontSize: 10, fontWeight: '700', letterSpacing: 0.5, marginTop: 2 },
  statDivider: { width: 1, alignSelf: 'stretch' },
  badges: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 24,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 6,
  },
  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  menuSection: {
    paddingHorizontal: 20,
  },
  menuTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 16,
  },
  noMenu: {
    textAlign: 'center',
    paddingVertical: 40,
    fontSize: 14,
  },
});
