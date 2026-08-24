import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, StatusBar, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../context/ThemeContext';

export default function ProfileScreen({ navigation }) {
  const { colors, isDark, toggleTheme } = useTheme();
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = () => {
    if (isLogin) {
      if (!email || !password) {
        Alert.alert('Missing Fields', 'Please enter your email and password.');
        return;
      }
      Alert.alert('Welcome Back! 🎉', `Logged in as ${email}`);
    } else {
      if (!name || !email || !password || !phone) {
        Alert.alert('Missing Fields', 'Please fill in all fields.');
        return;
      }
      Alert.alert('Welcome to RannaBari! 🎉', `Account created for ${name}`);
    }
  };

  return (
    <View style={[styles.container, { backgroundColor: colors.bg }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={toggleTheme} style={[styles.themeBtn, { backgroundColor: colors.surfaceHover }]}>
              <Ionicons name={isDark ? 'sunny' : 'moon'} size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          {/* Brand */}
          <View style={styles.brand}>
            <Text style={[styles.brandText, { color: colors.text }]}>
              RANNA<Text style={{ color: colors.primary }}>BARI</Text>
            </Text>
            <Text style={[styles.brandDesc, { color: colors.textMuted }]}>
              {isLogin ? 'Welcome back, foodie!' : 'Join our community of food lovers.'}
            </Text>
          </View>

          {/* Toggle */}
          <View style={[styles.toggleRow, { backgroundColor: colors.surfaceHover }]}>
            <TouchableOpacity
              style={[styles.toggleBtn, isLogin && { backgroundColor: colors.primary }]}
              onPress={() => setIsLogin(true)}
            >
              <Text style={[styles.toggleText, { color: isLogin ? '#FFF' : colors.textMuted }]}>
                SIGN IN
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.toggleBtn, !isLogin && { backgroundColor: colors.primary }]}
              onPress={() => setIsLogin(false)}
            >
              <Text style={[styles.toggleText, { color: !isLogin ? '#FFF' : colors.textMuted }]}>
                JOIN
              </Text>
            </TouchableOpacity>
          </View>

          {/* Form */}
          <View style={styles.form}>
            {!isLogin && (
              <>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
                  <Ionicons name="person-outline" size={18} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Full Name"
                    placeholderTextColor={colors.textLight}
                    value={name}
                    onChangeText={setName}
                  />
                </View>
                <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
                  <Ionicons name="call-outline" size={18} color={colors.textMuted} />
                  <TextInput
                    style={[styles.input, { color: colors.text }]}
                    placeholder="Phone Number"
                    placeholderTextColor={colors.textLight}
                    keyboardType="phone-pad"
                    value={phone}
                    onChangeText={setPhone}
                  />
                </View>
              </>
            )}

            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
              <Ionicons name="mail-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Email Address"
                placeholderTextColor={colors.textLight}
                keyboardType="email-address"
                autoCapitalize="none"
                value={email}
                onChangeText={setEmail}
              />
            </View>

            <View style={[styles.inputWrap, { borderColor: colors.border, backgroundColor: colors.bgElevated }]}>
              <Ionicons name="lock-closed-outline" size={18} color={colors.textMuted} />
              <TextInput
                style={[styles.input, { color: colors.text }]}
                placeholder="Password"
                placeholderTextColor={colors.textLight}
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
              />
              <TouchableOpacity onPress={() => setShowPassword(!showPassword)}>
                <Ionicons name={showPassword ? 'eye-off' : 'eye'} size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {isLogin && (
              <TouchableOpacity style={styles.forgotRow}>
                <Text style={[styles.forgotText, { color: colors.primary }]}>Forgot Password?</Text>
              </TouchableOpacity>
            )}

            <TouchableOpacity activeOpacity={0.85} onPress={handleSubmit}>
              <LinearGradient
                colors={[colors.primary, colors.primaryDark]}
                style={styles.submitBtn}
              >
                <Text style={styles.submitText}>{isLogin ? 'SIGN IN' : 'CREATE ACCOUNT'}</Text>
                <Ionicons name="arrow-forward" size={18} color="#FFF" />
              </LinearGradient>
            </TouchableOpacity>
          </View>

          {/* Become a Cook Link */}
          <View style={[styles.cookSection, { borderTopColor: colors.border }]}>
            <View style={[styles.cookIcon, { backgroundColor: colors.primaryLight }]}>
              <Ionicons name="restaurant" size={24} color={colors.primary} />
            </View>
            <Text style={[styles.cookTitle, { color: colors.text }]}>Are you a home cook?</Text>
            <Text style={[styles.cookDesc, { color: colors.textMuted }]}>
              Turn your kitchen into your business. Keep 85% of every order.
            </Text>
            <TouchableOpacity style={[styles.cookBtn, { borderColor: colors.primary }]}>
              <Text style={[styles.cookBtnText, { color: colors.primary }]}>BECOME AN ARTISAN</Text>
              <Ionicons name="arrow-forward" size={14} color={colors.primary} />
            </TouchableOpacity>
          </View>

        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: { paddingBottom: 100 },
  header: {
    paddingTop: 56,
    paddingHorizontal: 20,
    alignItems: 'flex-end',
  },
  themeBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  brand: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  brandText: {
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 1,
    marginBottom: 8,
  },
  brandDesc: {
    fontSize: 15,
  },
  toggleRow: {
    flexDirection: 'row',
    marginHorizontal: 20,
    borderRadius: 14,
    padding: 4,
    marginBottom: 24,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
  },
  form: {
    paddingHorizontal: 20,
    gap: 14,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 10,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    padding: 0,
  },
  forgotRow: {
    alignItems: 'flex-end',
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '700',
  },
  submitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 14,
    gap: 8,
    marginTop: 8,
  },
  submitText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1,
  },
  cookSection: {
    alignItems: 'center',
    marginTop: 40,
    paddingTop: 32,
    borderTopWidth: 1,
    marginHorizontal: 20,
    gap: 10,
  },
  cookIcon: {
    width: 56,
    height: 56,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cookTitle: { fontSize: 18, fontWeight: '900' },
  cookDesc: { fontSize: 13, textAlign: 'center', lineHeight: 18 },
  cookBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    gap: 6,
    marginTop: 4,
  },
  cookBtnText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
});
