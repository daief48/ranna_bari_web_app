import React from 'react';
import {
  View, Text, ScrollView, FlatList, TextInput, TouchableOpacity,
  Image, StyleSheet, StatusBar, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';
import ChefCard from '../components/ChefCard';
import ReviewCard from '../components/ReviewCard';
import MoodPill from '../components/MoodPill';
import chefsData from '../data/chefs.json';
import reviewsData from '../data/reviews.json';

const { width } = Dimensions.get('window');

const MOODS = [
  'Healthy & Keto', 'Heritage Spices', 'Comfort Stews',
  'Clean Street Food', 'Sweet Tooth', 'Coastal Catch', 'Plant-Based',
];

const STEPS = [
  { icon: 'restaurant', title: 'Pick an Artisan', desc: 'Browse curated menus from verified home cooks in your neighborhood.', color: 'primary' },
  { icon: 'flame', title: 'Freshly Prepared', desc: 'Your meal is cooked to order using fresh, safe, authentic ingredients.', color: 'saffron' },
  { icon: 'car', title: 'Delivered Hot', desc: 'Enjoy doorstep delivery right in time for breakfast, lunch, or dinner.', color: 'sage' },
];

const TRUST = [
  { icon: 'search', title: 'Verified Kitchens', desc: 'Our team personally inspects every home kitchen for strict hygiene standards.' },
  { icon: 'leaf', title: 'Fresh Ingredients', desc: 'Chefs use locally sourced, fresh ingredients just like feeding their own families.' },
  { icon: 'star', title: 'Community Rated', desc: 'Quality maintained through real-time ratings and transparent feedback.' },
];

export default function HomeScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const featuredChefs = chefsData.slice(0, 4);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <ScrollView showsVerticalScrollIndicator={false}>

        {/* Hero */}
        <LinearGradient
          colors={isDark ? ['#1A0F08', '#0F0F0F'] : [colors.primaryLight, colors.bg]}
          style={styles.hero}
        >
          <View style={styles.heroHeader}>
            <View>
              <Text style={[styles.brandText, { color: colors.text }]}>
                RANNA<Text style={{ color: colors.primary }}>BARI</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: colors.surfaceHover }]}>
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.heroBadge}>
            <View style={[styles.pulseDot, { backgroundColor: colors.success }]} />
            <Text style={[styles.heroBadgeText, { color: colors.textMuted }]}>100% Authentic Home Kitchens</Text>
          </View>

          <Text style={[styles.heroTitle, { color: colors.text }]}>
            CRAFTED AT{'\n'}
            <Text style={{ color: colors.primary }}>HOME.</Text>
            {'\n'}DELIVERED TO YOU.
          </Text>

          <Text style={[styles.heroDesc, { color: colors.textMuted }]}>
            Experience the finest home-cooked meals from verified culinary artisans in your neighborhood.
          </Text>

          {/* Search Bar */}
          <TouchableOpacity
            style={[styles.searchBar, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
            onPress={() => navigation.navigate('Browse')}
            activeOpacity={0.8}
          >
            <Ionicons name="search" size={20} color={colors.textMuted} />
            <Text style={[styles.searchPlaceholder, { color: colors.textLight }]}>
              Enter your area (e.g. Dhanmondi)
            </Text>
            <View style={[styles.findBtn, { backgroundColor: colors.primary }]}>
              <Text style={styles.findBtnText}>Find</Text>
            </View>
          </TouchableOpacity>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>50+</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Verified Artisans</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>4.8</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Avg Rating</Text>
            </View>
            <View style={[styles.statDivider, { backgroundColor: colors.border }]} />
            <View style={styles.statItem}>
              <Text style={[styles.statNumber, { color: colors.text }]}>10K+</Text>
              <Text style={[styles.statLabel, { color: colors.textMuted }]}>Meals Served</Text>
            </View>
          </View>
        </LinearGradient>

        {/* Mood Carousel */}
        <View style={styles.section}>
          <Text style={[styles.sectionSmallTitle, { color: colors.text }]}>What are you craving?</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={MOODS}
            keyExtractor={(item) => item}
            contentContainerStyle={{ paddingHorizontal: 20 }}
            renderItem={({ item }) => (
              <MoodPill label={item} onPress={() => navigation.navigate('Browse')} />
            )}
          />
        </View>

        {/* How It Works */}
        <View style={[styles.section, { paddingHorizontal: 20 }]}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            HOW IT <Text style={{ color: colors.primary }}>WORKS</Text>
          </Text>
          <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
            From their kitchen to your table in 3 simple steps
          </Text>
          {STEPS.map((step, i) => (
            <View
              key={i}
              style={[styles.stepCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={[styles.stepIconWrap, {
                backgroundColor: i === 0 ? colors.primaryLight : i === 1 ? 'rgba(242,169,0,0.12)' : 'rgba(107,143,113,0.12)',
              }]}>
                <Ionicons name={step.icon} size={24} color={i === 0 ? colors.primary : i === 1 ? colors.saffron : colors.sage} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.stepTitle, { color: colors.text }]}>{step.title}</Text>
                <Text style={[styles.stepDesc, { color: colors.textMuted }]}>{step.desc}</Text>
              </View>
              <Text style={[styles.stepNum, { color: colors.border }]}>{i + 1}</Text>
            </View>
          ))}
        </View>

        {/* Featured Chefs */}
        <View style={[styles.section, { paddingHorizontal: 20 }]}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>
                FEATURED <Text style={{ color: colors.primary }}>CHEFS</Text>
              </Text>
              <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
                The highest-rated culinary artists near you
              </Text>
            </View>
            <TouchableOpacity onPress={() => navigation.navigate('Browse')}>
              <Text style={[styles.viewAll, { color: colors.primary }]}>VIEW ALL</Text>
            </TouchableOpacity>
          </View>
          {featuredChefs.map((chef) => (
            <ChefCard
              key={chef.id}
              chef={chef}
              onPress={() => navigation.navigate('Chef', { chefId: chef.id })}
            />
          ))}
        </View>

        {/* Testimonials */}
        <View style={styles.section}>
          <View style={{ paddingHorizontal: 20 }}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              WHAT <Text style={{ color: colors.primary }}>FOODIES</Text> SAY
            </Text>
            <Text style={[styles.sectionSubtitle, { color: colors.textMuted }]}>
              Real orders, real kitchens, real neighbours.
            </Text>
          </View>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={reviewsData}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16 }}
            renderItem={({ item }) => <ReviewCard review={item} />}
          />
        </View>

        {/* Trust Section */}
        <View style={[styles.section, { paddingHorizontal: 20 }]}>
          <LinearGradient
            colors={[colors.primary, colors.primaryDark]}
            style={styles.trustHero}
          >
            <Ionicons name="shield" size={36} color="rgba(255,255,255,0.85)" />
            <Text style={styles.trustTitle}>THE RANNABARI{'\n'}STANDARD</Text>
            <Text style={styles.trustDesc}>
              Every home cook goes through a rigorous vetting process so you can eat with complete peace of mind.
            </Text>
          </LinearGradient>

          {TRUST.map((point, i) => (
            <View
              key={i}
              style={[styles.trustCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={[styles.trustIcon, {
                backgroundColor: i === 0 ? colors.primaryLight : i === 1 ? 'rgba(107,143,113,0.12)' : 'rgba(242,169,0,0.12)',
              }]}>
                <Ionicons name={point.icon} size={22} color={i === 0 ? colors.primary : i === 1 ? colors.sage : colors.saffron} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.trustPointTitle, { color: colors.text }]}>{point.title}</Text>
                <Text style={[styles.trustPointDesc, { color: colors.textMuted }]}>{point.desc}</Text>
              </View>
            </View>
          ))}
        </View>

        {/* Footer */}
        <View style={[styles.footer, { borderTopColor: colors.border }]}>
          <Text style={[styles.brandText, { color: colors.text, fontSize: 18 }]}>
            RANNA<Text style={{ color: colors.primary }}>BARI</Text>
          </Text>
          <Text style={[styles.footerText, { color: colors.textLight }]}>
            © 2026 RannaBari. Shaping the future of localized gastronomy.
          </Text>
        </View>

      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  hero: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 28,
  },
  brandText: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  pulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  heroBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  heroTitle: {
    fontSize: 36,
    fontWeight: '900',
    lineHeight: 42,
    marginBottom: 16,
    letterSpacing: 0.5,
  },
  heroDesc: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 24,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 6,
    paddingLeft: 16,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    marginBottom: 24,
  },
  searchPlaceholder: {
    flex: 1,
    fontSize: 14,
  },
  findBtn: {
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
  },
  findBtnText: {
    color: '#FFF',
    fontWeight: '800',
    fontSize: 14,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
  },
  statItem: { alignItems: 'center' },
  statNumber: { fontSize: 26, fontWeight: '900' },
  statLabel: { fontSize: 11, fontWeight: '600', marginTop: 2, textTransform: 'uppercase' },
  statDivider: { width: 1, height: 30 },

  // Sections
  section: { marginTop: 32 },
  sectionSmallTitle: {
    fontSize: 18,
    fontWeight: '800',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  sectionSubtitle: {
    fontSize: 14,
    marginTop: 4,
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  viewAll: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: 4,
  },

  // How It Works
  stepCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    gap: 16,
  },
  stepIconWrap: {
    width: 50,
    height: 50,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  stepDesc: { fontSize: 13, lineHeight: 18 },
  stepNum: { fontSize: 48, fontWeight: '900', opacity: 0.15 },

  // Trust
  trustHero: {
    padding: 32,
    borderRadius: 24,
    marginBottom: 16,
  },
  trustTitle: {
    color: '#FFF',
    fontSize: 32,
    fontWeight: '900',
    lineHeight: 36,
    marginTop: 16,
    marginBottom: 12,
  },
  trustDesc: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
  },
  trustCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderRadius: 18,
    borderWidth: 1,
    marginBottom: 12,
    gap: 16,
  },
  trustIcon: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  trustPointTitle: { fontSize: 16, fontWeight: '800', marginBottom: 4 },
  trustPointDesc: { fontSize: 13, lineHeight: 18 },

  // Footer
  footer: {
    alignItems: 'center',
    paddingVertical: 40,
    marginTop: 20,
    borderTopWidth: 1,
    marginHorizontal: 20,
  },
  footerText: { fontSize: 12, marginTop: 8, textAlign: 'center' },
});
