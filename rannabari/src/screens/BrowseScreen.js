import React, { useState, useMemo } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, StatusBar,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import ChefCard from '../components/ChefCard';
import chefsData from '../data/chefs.json';

const CATEGORIES = [
  { label: 'ALL', filter: 'all' },
  { label: 'MORNING', filter: 'breakfast' },
  { label: 'LUNCH', filter: 'lunch' },
  { label: 'EVENING', filter: 'dinner' },
  { label: 'HEALTHY', filter: 'healthy' },
];

const AREAS = ['All Areas', 'Dhanmondi', 'Mirpur', 'Uttara', 'Banani', 'Gulshan', 'Mohammadpur', 'Old Dhaka', 'Bashundhara', 'Motijheel'];

export default function BrowseScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [showAreaPicker, setShowAreaPicker] = useState(false);
  const [selectedArea, setSelectedArea] = useState('All Areas');

  const filtered = useMemo(() => {
    return chefsData.filter((chef) => {
      // Category filter
      if (activeFilter !== 'all' && !chef.tags.includes(activeFilter)) return false;

      // Area filter
      if (selectedArea !== 'All Areas' && chef.area !== selectedArea) return false;

      // Search filter
      if (search.trim()) {
        const s = search.toLowerCase();
        return (
          chef.name.toLowerCase().includes(s) ||
          chef.specialty.toLowerCase().includes(s) ||
          chef.tags.some((t) => t.toLowerCase().includes(s)) ||
          chef.area.toLowerCase().includes(s)
        );
      }
      return true;
    });
  }, [search, activeFilter, selectedArea]);

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.bg }]}>
        <Text style={[styles.title, { color: colors.text }]}>
          DISCOVER <Text style={{ color: colors.primary }}>ARTISANS</Text>
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Find the perfect meal curated by local chefs.
        </Text>

        {/* Search */}
        <View style={[styles.searchBar, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search cuisines, chefs, or areas..."
            placeholderTextColor={colors.textLight}
            value={search}
            onChangeText={setSearch}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </TouchableOpacity>
          )}
        </View>

        {/* Category Pills */}
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={CATEGORIES}
          keyExtractor={(item) => item.filter}
          style={{ marginBottom: 12 }}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.filterPill,
                {
                  backgroundColor: activeFilter === item.filter ? colors.primary : colors.bgElevated,
                  borderColor: activeFilter === item.filter ? colors.primary : colors.border,
                },
              ]}
              onPress={() => setActiveFilter(item.filter)}
            >
              <Text
                style={[
                  styles.filterPillText,
                  { color: activeFilter === item.filter ? '#FFF' : colors.textMuted },
                ]}
              >
                {item.label}
              </Text>
            </TouchableOpacity>
          )}
        />

        {/* Area Selector */}
        <TouchableOpacity
          style={[styles.areaPicker, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}
          onPress={() => setShowAreaPicker(!showAreaPicker)}
        >
          <Ionicons name="location" size={16} color={colors.primary} />
          <Text style={[styles.areaText, { color: colors.text }]}>{selectedArea}</Text>
          <Ionicons name="chevron-down" size={16} color={colors.textMuted} />
        </TouchableOpacity>

        {/* Area Dropdown */}
        {showAreaPicker && (
          <View style={[styles.areaDropdown, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
            {AREAS.map((area) => (
              <TouchableOpacity
                key={area}
                style={[
                  styles.areaOption,
                  selectedArea === area && { backgroundColor: colors.primaryLight },
                ]}
                onPress={() => {
                  setSelectedArea(area);
                  setShowAreaPicker(false);
                }}
              >
                <Text style={[styles.areaOptionText, { color: selectedArea === area ? colors.primary : colors.text }]}>
                  {area}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        <Text style={[styles.resultCount, { color: colors.textMuted }]}>
          {filtered.length} ARTISANS CURATED FOR YOU
        </Text>
      </View>

      {/* Chef Grid */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 100 }}
        renderItem={({ item }) => (
          <ChefCard
            chef={item}
            onPress={() => navigation.navigate('Chef', { chefId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search" size={48} color={colors.textLight} />
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No artisans found matching your criteria.
            </Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 16,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    padding: 0,
  },
  filterPill: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 8,
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  areaPicker: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
    gap: 8,
    marginBottom: 12,
  },
  areaText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '700',
  },
  areaDropdown: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    overflow: 'hidden',
  },
  areaOption: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  areaOptionText: {
    fontSize: 14,
    fontWeight: '600',
  },
  resultCount: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: 8,
  },
  empty: {
    alignItems: 'center',
    paddingVertical: 60,
    gap: 12,
  },
  emptyText: {
    fontSize: 15,
    textAlign: 'center',
  },
});
