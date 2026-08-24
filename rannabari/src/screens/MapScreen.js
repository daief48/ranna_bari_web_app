import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  Image, StyleSheet, StatusBar, Dimensions, Alert, Platform,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as Location from 'expo-location';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../context/ThemeContext';
import chefsData from '../data/chefs.json';

const { width, height } = Dimensions.get('window');
const MAPTILER_KEY = 'SxjK1zJHWJ8lvm7cplMH';
const NEAREST_COUNT = 5;

// Haversine great-circle distance in km
function distanceKm(a, b) {
  const R = 6371;
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function formatDistance(km) {
  if (km < 1) return Math.round(km * 1000) + ' m';
  if (km < 10) return km.toFixed(1) + ' km';
  return Math.round(km) + ' km';
}

function getMapHtml(isDark) {
  const tileStyle = isDark ? 'streets-v2-dark' : 'streets-v2';
  const tileUrl = `https://api.maptiler.com/maps/${tileStyle}/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`;

  // Serialize chefs into the HTML
  const chefsJSON = JSON.stringify(
    chefsData.filter((c) => c.lat && c.lng).map((c) => ({
      id: c.id,
      name: c.name,
      avatar: c.avatar,
      specialty: c.specialty,
      rating: c.rating,
      reviewCount: c.reviewCount,
      isVerified: c.isVerified,
      area: c.area,
      lat: c.lat,
      lng: c.lng,
    }))
  );

  return `
<!DOCTYPE html>
<html><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html, body { height: 100%; overflow: hidden; }
  #map { width: 100%; height: 100%; }
  
  .map-marker {
    width: 40px; height: 40px; border-radius: 50%;
    background: linear-gradient(145deg, ${isDark ? '#F07A45' : '#E8652B'}, ${isDark ? '#E8652B' : '#C7501F'});
    border: 3px solid ${isDark ? '#1E1E1E' : '#FFFFFF'};
    box-shadow: 0 4px 12px rgba(232,101,43,0.35);
    display: flex; align-items: center; justify-content: center;
    color: #fff; font-size: 18px;
  }
  
  .me-marker {
    width: 18px; height: 18px; border-radius: 50%;
    background: #2F7DF6;
    border: 3px solid #fff;
    box-shadow: 0 0 0 2px rgba(47,125,246,0.35), 0 3px 10px rgba(0,0,0,0.35);
  }
  .me-marker::after {
    content: ''; position: absolute; inset: -9px;
    border-radius: 50%; border: 2px solid rgba(47,125,246,0.5);
    animation: mePulse 2.2s ease-out infinite;
  }
  @keyframes mePulse {
    0% { transform: scale(0.55); opacity: 0.9; }
    100% { transform: scale(1.5); opacity: 0; }
  }
  
  .leaflet-popup-content-wrapper {
    background: ${isDark ? '#1E1E1E' : '#FFFFFF'};
    color: ${isDark ? '#F0F0F0' : '#1A1A1A'};
    border-radius: 16px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.15);
    border: 1px solid ${isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)'};
  }
  .leaflet-popup-tip {
    background: ${isDark ? '#1E1E1E' : '#FFFFFF'};
  }
  .leaflet-popup-close-button {
    color: ${isDark ? '#A0A0A0' : '#999'} !important;
  }
  
  .popup-card { text-align: center; padding: 8px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
  .popup-card img { width: 52px; height: 52px; border-radius: 50%; margin-bottom: 8px; object-fit: cover; }
  .popup-card h4 { margin: 0 0 4px; font-size: 17px; font-weight: 800; color: ${isDark ? '#F0F0F0' : '#1A1A1A'}; }
  .popup-card p { margin: 0 0 4px; font-size: 12px; color: ${isDark ? '#A0A0A0' : '#6B6B6B'}; }
  .popup-card .rating { font-size: 13px; color: #F2A900; margin-bottom: 10px; }
  .popup-card .view-btn {
    display: inline-block; padding: 10px 24px;
    background: ${isDark ? '#F07A45' : '#E8652B'}; color: #fff;
    font-size: 13px; font-weight: 800; text-decoration: none;
    border-radius: 30px; letter-spacing: 0.5px;
    border: none; cursor: pointer;
  }
</style>
</head><body>
<div id="map"></div>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  var chefs = ${chefsJSON};
  var map = L.map('map', { zoomControl: true }).setView([23.8103, 90.4125], 12);
  
  L.tileLayer('${tileUrl}', {
    tileSize: 512,
    zoomOffset: -1,
    minZoom: 1,
    maxZoom: 20,
    crossOrigin: true,
    attribution: '© MapTiler © OpenStreetMap'
  }).addTo(map);
  
  var customIcon = L.divIcon({
    className: '',
    html: '<div class="map-marker">🍳</div>',
    iconSize: [40, 40],
    iconAnchor: [20, 20],
    popupAnchor: [0, -20]
  });
  
  var markers = {};
  
  chefs.forEach(function(c) {
    var marker = L.marker([c.lat, c.lng], { icon: customIcon }).addTo(map);
    markers[c.id] = marker;
    
    marker.bindPopup(
      '<div class="popup-card">' +
        '<img src="' + c.avatar + '">' +
        '<h4>' + c.name + '</h4>' +
        '<p>' + c.specialty + ' • ' + c.area + '</p>' +
        '<div class="rating">★ ' + c.rating + ' (' + c.reviewCount + ')</div>' +
        '<button class="view-btn" onclick="window.ReactNativeWebView.postMessage(JSON.stringify({type:\\'viewChef\\',chefId:' + c.id + '}))">View Menu & Order</button>' +
      '</div>',
      { minWidth: 200 }
    );
  });
  
  // Listen for messages from React Native
  window.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'flyToChef') {
        var m = markers[msg.chefId];
        if (m) { map.flyTo(m.getLatLng(), 15, { duration: 0.6 }); m.openPopup(); }
      }
      if (msg.type === 'showLocation') {
        var lat = msg.lat, lng = msg.lng, acc = msg.accuracy;
        // Drop "you are here" marker
        L.marker([lat, lng], {
          icon: L.divIcon({
            className: '',
            html: '<div class="me-marker"></div>',
            iconSize: [18, 18],
            iconAnchor: [9, 9]
          }),
          zIndexOffset: 1000
        }).addTo(map).bindPopup('You are here');
        
        // Fit bounds to user + nearest chefs
        var nearest = chefs.map(function(c) {
          return { id: c.id, lat: c.lat, lng: c.lng };
        });
        var bounds = [[lat, lng]];
        nearest.slice(0, 5).forEach(function(c) { bounds.push([c.lat, c.lng]); });
        map.fitBounds(bounds, { padding: [50, 50], maxZoom: 15 });
      }
    } catch(ex) {}
  });
  
  // Also handle document-level message for Android
  document.addEventListener('message', function(e) {
    try {
      var msg = JSON.parse(e.data);
      if (msg.type === 'flyToChef') {
        var m = markers[msg.chefId];
        if (m) { map.flyTo(m.getLatLng(), 15, { duration: 0.6 }); m.openPopup(); }
      }
    } catch(ex) {}
  });
</script>
</body></html>`;
}

export default function MapScreen({ navigation }) {
  const { colors, isDark } = useTheme();
  const webViewRef = useRef(null);
  const [search, setSearch] = useState('');
  const [locating, setLocating] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [nearbyChefs, setNearbyChefs] = useState(null);
  const [showNearby, setShowNearby] = useState(false);

  const handleMessage = (event) => {
    try {
      const msg = JSON.parse(event.nativeEvent.data);
      if (msg.type === 'viewChef') {
        navigation.navigate('Chef', { chefId: msg.chefId });
      }
    } catch (e) {}
  };

  const requestLocation = async () => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Denied', 'Location permission is needed to find nearest cooks.');
        setLocating(false);
        return;
      }

      const location = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const me = { lat: location.coords.latitude, lng: location.coords.longitude };
      setUserLocation(me);

      // Send location to WebView
      webViewRef.current?.postMessage(
        JSON.stringify({
          type: 'showLocation',
          lat: me.lat,
          lng: me.lng,
          accuracy: location.coords.accuracy,
        })
      );

      // Calculate nearest chefs
      const ranked = chefsData
        .filter((c) => c.lat && c.lng)
        .map((c) => ({
          chef: c,
          km: distanceKm(me, { lat: c.lat, lng: c.lng }),
        }))
        .sort((a, b) => a.km - b.km)
        .slice(0, NEAREST_COUNT);

      setNearbyChefs(ranked);
      setShowNearby(true);
    } catch (err) {
      Alert.alert('Location Error', 'Could not determine your location right now.');
    }
    setLocating(false);
  };

  const flyToChef = (chefId) => {
    webViewRef.current?.postMessage(
      JSON.stringify({ type: 'flyToChef', chefId })
    );
  };

  // Filter chefs by search for the search overlay
  const searchResults = search.trim()
    ? chefsData.filter((c) => {
        const s = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(s) ||
          c.specialty.toLowerCase().includes(s) ||
          c.area.toLowerCase().includes(s)
        );
      })
    : [];

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />

      {/* Map WebView */}
      <WebView
        ref={webViewRef}
        source={{ html: getMapHtml(isDark) }}
        style={styles.map}
        onMessage={handleMessage}
        javaScriptEnabled
        domStorageEnabled
        startInLoadingState
        originWhitelist={['*']}
      />

      {/* Search Overlay */}
      <View style={[styles.searchOverlay, { backgroundColor: colors.bgGlass, borderColor: colors.border }]}>
        <Ionicons name="search" size={18} color={colors.primary} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search areas or kitchens..."
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

      {/* Search Results Dropdown */}
      {searchResults.length > 0 && (
        <View style={[styles.searchResults, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
          {searchResults.slice(0, 5).map((chef) => (
            <TouchableOpacity
              key={chef.id}
              style={styles.searchItem}
              onPress={() => {
                flyToChef(chef.id);
                setSearch('');
              }}
            >
              <Image source={{ uri: chef.avatar }} style={styles.searchAvatar} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.searchName, { color: colors.text }]}>{chef.name}</Text>
                <Text style={[styles.searchSub, { color: colors.textMuted }]}>
                  {chef.specialty} • {chef.area}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* Locate Button */}
      <TouchableOpacity
        style={[
          styles.locateBtn,
          {
            backgroundColor: userLocation ? colors.primary : colors.bgElevated,
            borderColor: userLocation ? colors.primary : colors.border,
          },
        ]}
        onPress={requestLocation}
        disabled={locating}
        activeOpacity={0.8}
      >
        <Ionicons
          name="locate"
          size={17}
          color={userLocation ? '#FFF' : colors.primary}
        />
        <Text
          style={[
            styles.locateBtnText,
            { color: userLocation ? '#FFF' : colors.text },
          ]}
        >
          {locating ? 'Locating…' : userLocation ? 'Near me' : 'Nearest cooks'}
        </Text>
      </TouchableOpacity>

      {/* Nearby Panel (Bottom Sheet) */}
      {showNearby && nearbyChefs && (
        <View style={[styles.nearbyPanel, { backgroundColor: colors.bgElevated, borderColor: colors.border }]}>
          <View style={[styles.nearbyHeader, { borderBottomColor: colors.border }]}>
            <Text style={[styles.nearbyTitle, { color: colors.textMuted }]}>
              {nearbyChefs.length} NEAREST TO YOU
            </Text>
            <TouchableOpacity onPress={() => setShowNearby(false)}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
          <FlatList
            data={nearbyChefs}
            keyExtractor={(item) => String(item.chef.id)}
            style={{ maxHeight: 280 }}
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.nearbyItem}
                onPress={() => {
                  flyToChef(item.chef.id);
                }}
              >
                <Image source={{ uri: item.chef.avatar }} style={styles.nearbyAvatar} />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.nearbyName, { color: colors.text }]}>{item.chef.name}</Text>
                  <Text style={[styles.nearbySub, { color: colors.textMuted }]}>{item.chef.specialty}</Text>
                </View>
                <View style={[styles.nearbyDist, { backgroundColor: colors.primaryLight }]}>
                  <Text style={[styles.nearbyDistText, { color: colors.primary }]}>
                    {formatDistance(item.km)}
                  </Text>
                </View>
              </TouchableOpacity>
            )}
          />
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  map: { flex: 1 },

  // Search
  searchOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 60 : 45,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    gap: 10,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 12 },
      android: { elevation: 6 },
    }),
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  searchResults: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 110 : 95,
    left: 16,
    right: 16,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.12, shadowRadius: 12 },
      android: { elevation: 8 },
    }),
  },
  searchItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 10,
  },
  searchAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
  },
  searchName: {
    fontSize: 14,
    fontWeight: '700',
  },
  searchSub: {
    fontSize: 11,
  },

  // Locate button
  locateBtn: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 118 : 103,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 30,
    borderWidth: 1,
    gap: 8,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.1, shadowRadius: 10 },
      android: { elevation: 5 },
    }),
  },
  locateBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },

  // Nearby panel
  nearbyPanel: {
    position: 'absolute',
    bottom: 90,
    left: 12,
    right: 12,
    borderRadius: 20,
    borderWidth: 1,
    overflow: 'hidden',
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.1, shadowRadius: 15 },
      android: { elevation: 10 },
    }),
  },
  nearbyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  nearbyTitle: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  nearbyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 12,
  },
  nearbyAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
  },
  nearbyName: {
    fontSize: 15,
    fontWeight: '700',
  },
  nearbySub: {
    fontSize: 12,
  },
  nearbyDist: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  nearbyDistText: {
    fontSize: 12,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
