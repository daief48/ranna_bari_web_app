import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';

import { useTheme } from '../context/ThemeContext';
import { useCart } from '../context/CartContext';

import HomeScreen from '../screens/HomeScreen';
import BrowseScreen from '../screens/BrowseScreen';
import ChefScreen from '../screens/ChefScreen';
import CartScreen from '../screens/CartScreen';
import MapScreen from '../screens/MapScreen';
import ProfileScreen from '../screens/ProfileScreen';

const Tab = createBottomTabNavigator();
const Stack = createNativeStackNavigator();

// Home stack (Home → Chef detail)
function HomeStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="HomeMain" component={HomeScreen} />
      <Stack.Screen name="Chef" component={ChefScreen} />
    </Stack.Navigator>
  );
}

// Browse stack (Browse → Chef detail)
function BrowseStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="BrowseMain" component={BrowseScreen} />
      <Stack.Screen name="Chef" component={ChefScreen} />
    </Stack.Navigator>
  );
}

// Map stack (map → chef detail)
function MapStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MapMain" component={MapScreen} />
      <Stack.Screen name="Chef" component={ChefScreen} />
    </Stack.Navigator>
  );
}

function CartBadge({ count, color }) {
  if (count <= 0) return null;
  return (
    <View style={[styles.badge, { backgroundColor: color }]}>
      <Text style={styles.badgeText}>{count > 9 ? '9+' : count}</Text>
    </View>
  );
}

export default function AppNavigator() {
  const { colors } = useTheme();
  const { cartCount } = useCart();

  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.tabBar,
            borderTopColor: colors.border,
            position: 'absolute',
            height: 80,
            paddingTop: 8,
            paddingBottom: 24,
          },
          tabBarActiveTintColor: colors.tabActive,
          tabBarInactiveTintColor: colors.tabInactive,
          tabBarLabelStyle: {
            fontSize: 11,
            fontWeight: '700',
          },
          tabBarIcon: ({ focused, color, size }) => {
            let iconName;
            if (route.name === 'HomeTab') iconName = focused ? 'home' : 'home-outline';
            else if (route.name === 'BrowseTab') iconName = focused ? 'search' : 'search-outline';
            else if (route.name === 'MapTab') iconName = focused ? 'map' : 'map-outline';
            else if (route.name === 'CartTab') iconName = focused ? 'cart' : 'cart-outline';
            else if (route.name === 'ProfileTab') iconName = focused ? 'person' : 'person-outline';

            return (
              <View>
                <Ionicons name={iconName} size={24} color={color} />
                {route.name === 'CartTab' && <CartBadge count={cartCount} color={colors.primary} />}
              </View>
            );
          },
        })}
      >
        <Tab.Screen name="HomeTab" component={HomeStack} options={{ tabBarLabel: 'Home' }} />
        <Tab.Screen name="BrowseTab" component={BrowseStack} options={{ tabBarLabel: 'Browse' }} />
        <Tab.Screen name="MapTab" component={MapStack} options={{ tabBarLabel: 'Map' }} />
        <Tab.Screen name="CartTab" component={CartScreen} options={{ tabBarLabel: 'Cart' }} />
        <Tab.Screen name="ProfileTab" component={ProfileScreen} options={{ tabBarLabel: 'Profile' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    right: -8,
    top: -4,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: '#FFF',
    fontSize: 10,
    fontWeight: '800',
  },
});
