// frontend/app/_context/AuthContext.js

import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import axios from "axios";
import { API_BASE_URL } from "../_config";

// Create context with default values
export const AuthContext = createContext({
  user: null,
  token: null,
  isSubscribed: false,
  subscriptionExpiresAt: null,
  profiles: [],
  loading: true,
  login: () => {},
  logout: () => {},
  loadProfiles: () => {},
  checkSubscription: () => false,
  updateSubscription: () => {},
  setUser: () => {},
  setToken: () => {},
  setIsSubscribed: () => {},
  setSubscriptionExpiresAt: () => {}, // ✅ ADD THIS
});

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load user data from AsyncStorage on app start
  const loadUserFromStorage = useCallback(async () => {
    try {
      const [userData, authToken, subscribed, expiry] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('isSubscribed'),
        AsyncStorage.getItem('subscriptionExpiresAt')
      ]);

      if (userData && authToken) {
        const parsedUser = JSON.parse(userData);
        setUser(parsedUser);
        setToken(authToken);

        const isSubscribedValue = JSON.parse(subscribed) === true;
        const subscriptionValid = expiry && new Date(expiry) > new Date();

        setIsSubscribed(isSubscribedValue && subscriptionValid);
        setSubscriptionExpiresAt(expiry);
      }
    } catch (error) {
      console.error('Failed to load user data', error);
      Alert.alert('Error', 'Failed to load user data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch profiles from API
  const loadProfiles = useCallback(async () => {
    try {
      const currentToken = token || await AsyncStorage.getItem('token');
      if (!currentToken) return [];

      const response = await axios.get(`${API_BASE_URL}/api/profiles`, {
        headers: { Authorization: `Bearer ${currentToken}` }
      });

      setProfiles(response.data.profiles || []);
      return response.data.profiles || [];
    } catch (error) {
      console.error('Failed to load profiles', error);
      Alert.alert('Error', 'Failed to load profiles');
      return [];
    }
  }, [token]);

  // Login function
  const login = useCallback(async (userData, authToken, subscribed = false, expiry = null) => {
    try {
      await Promise.all([
        AsyncStorage.setItem('user', JSON.stringify(userData)),
        AsyncStorage.setItem('token', authToken),
        AsyncStorage.setItem('isSubscribed', JSON.stringify(subscribed)),
        AsyncStorage.setItem('subscriptionExpiresAt', expiry),
      ]);

      setUser(userData);
      setToken(authToken);
      setIsSubscribed(subscribed);
      setSubscriptionExpiresAt(expiry);

      await loadProfiles();
      return true;
    } catch (error) {
      console.error('Login failed', error);
      Alert.alert('Login Error', 'Failed to save login data');
      return false;
    }
  }, [loadProfiles]);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem('user'),
        AsyncStorage.removeItem('token'),
        AsyncStorage.removeItem('isSubscribed'),
        AsyncStorage.removeItem('subscriptionExpiresAt'),
      ]);

      setUser(null);
      setToken(null);
      setIsSubscribed(false);
      setSubscriptionExpiresAt(null);
      setProfiles([]);
      return true;
    } catch (error) {
      console.error('Logout error:', error);
      Alert.alert('Logout Error', 'Failed to clear user data');
      return false;
    }
  }, []);

  // Check subscription status
  const checkSubscription = useCallback(() => {
    if (!subscriptionExpiresAt) return false;
    return new Date(subscriptionExpiresAt) > new Date();
  }, [subscriptionExpiresAt]);

  // Update subscription
  const updateSubscription = useCallback(async (expiryDate) => {
    try {
      const updatedUser = {
        ...user,
        subscription: {
          ...user?.subscription,
          isActive: true,
          expiresAt: expiryDate
        }
      };

      await Promise.all([
        AsyncStorage.setItem('user', JSON.stringify(updatedUser)),
        AsyncStorage.setItem('isSubscribed', 'true'),
        AsyncStorage.setItem('subscriptionExpiresAt', expiryDate),
      ]);

      setUser(updatedUser);
      setIsSubscribed(true);
      setSubscriptionExpiresAt(expiryDate);
      return true;
    } catch (error) {
      console.error('Subscription update failed', error);
      Alert.alert('Subscription Error', 'Failed to update subscription');
      return false;
    }
  }, [user]);

  // Initialize on mount
  useEffect(() => {
    loadUserFromStorage();
  }, [loadUserFromStorage]);

  // Periodic subscription check
  useEffect(() => {
    const interval = setInterval(() => {
      if (subscriptionExpiresAt && new Date(subscriptionExpiresAt) < new Date()) {
        setIsSubscribed(false);
      }
    }, 60000); // check every 60 seconds

    return () => clearInterval(interval);
  }, [subscriptionExpiresAt]);

  const value = {
    user,
    setUser,
    token,
    setToken,
    isSubscribed,
    setIsSubscribed,
    subscriptionExpiresAt,
    setSubscriptionExpiresAt, // ✅ FIXED: now exposed
    profiles,
    loading,
    login,
    logout,
    loadProfiles,
    checkSubscription,
    updateSubscription,
  };

  return (
    <AuthContext.Provider value={value}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
