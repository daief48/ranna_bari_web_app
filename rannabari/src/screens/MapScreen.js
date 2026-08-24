import React from 'react';
import { View, Text, StyleSheet, StatusBar, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import chefsData from '../data/chefs.json';

const { width } = Dimensions.get('window');

// Simple placeholder map screen since react-native-maps requires 
// Google Maps API key setup. Shows chef locations in a list format.
export default function MapScreen({ navigation }) {
  const { colors, isDark } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      <View style={[styles.header, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          EXPLORE <Text style={{ color: colors.primary }}>MAP</Text>
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Find artisans near you across Dhaka
        </Text>
      </View>

      {/* Map Placeholder */}
      <View style={[styles.mapPlaceholder, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
        <Ionicons name="map" size={48} color={colors.primary} />
        <Text style={[styles.placeholderTitle, { color: colors.text }]}>Interactive Map</Text>
        <Text style={[styles.placeholderDesc, { color: colors.textMuted }]}>
          Configure a Google Maps API key in app.json to enable the full interactive map experience.
        </Text>
      </View>

      {/* Chef Locations List */}
      <View style={styles.locationList}>
        <Text style={[styles.locationsTitle, { color: colors.text }]}>
          CHEF LOCATIONS
        </Text>
        {[...new Set(chefsData.map((c) => c.area))].map((area) => {
          const chefsInArea = chefsData.filter((c) => c.area === area);
          return (
            <View
              key={area}
              style={[styles.locationCard, { backgroundColor: colors.card, borderColor: colors.cardBorder }]}
            >
              <View style={[styles.locationIcon, { backgroundColor: colors.primaryLight }]}>
                <Ionicons name="location" size={20} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.locationArea, { color: colors.text }]}>{area}</Text>
                <Text style={[styles.locationCount, { color: colors.textMuted }]}>
                  {chefsInArea.length} artisan{chefsInArea.length > 1 ? 's' : ''} • {chefsInArea.map((c) => c.name).join(', ')}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </View>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
  },
  mapPlaceholder: {
    marginHorizontal: 20,
    padding: 40,
    borderRadius: 20,
    borderWidth: 1,
    alignItems: 'center',
    gap: 12,
    marginBottom: 24,
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  placeholderDesc: {
    fontSize: 13,
    textAlign: 'center',
    lineHeight: 18,
  },
  locationList: {
    paddingHorizontal: 20,
  },
  locationsTitle: {
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 12,
  },
  locationCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    gap: 12,
    marginBottom: 8,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationArea: {
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 2,
  },
  locationCount: {
    fontSize: 11,
    lineHeight: 15,
  },
});
