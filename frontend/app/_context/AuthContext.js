// frontend/app/_context/AuthContext.js
import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";
import axios from "axios";
import { API_BASE_URL } from "../_config";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(null);
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Load user data from AsyncStorage on app start
  const loadUserFromStorage = async () => {
    try {
      const [userData, authToken, subscribed, expiry] = await Promise.all([
        AsyncStorage.getItem('user'),
        AsyncStorage.getItem('token'),
        AsyncStorage.getItem('isSubscribed'),
        AsyncStorage.getItem('subscriptionExpiresAt')
      ]);
      
      if (userData && authToken) {
        setUser(JSON.parse(userData));
        setToken(authToken);
        setIsSubscribed(JSON.parse(subscribed));
        setSubscriptionExpiresAt(expiry);
        
        // Check subscription expiry
        if (expiry && new Date(expiry) < new Date()) {
          setIsSubscribed(false);
        }
      }
    } catch (error) {
      console.error('Failed to load user data', error);
    } finally {
      setLoading(false);
    }
  };

  // Fetch profiles from API
  const loadProfiles = async () => {
    try {
      const token = await AsyncStorage.getItem('token');
      if (!token) return [];
      
      const response = await axios.get(`${API_BASE_URL}/api/profiles`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      setProfiles(response.data.profiles || []);
      return response.data.profiles || [];
    } catch (error) {
      console.error('Failed to load profiles', error);
      return [];
    }
  };

  // Login function
  const login = async (userData, authToken, subscribed = false, expiry = null) => {
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
      
      // Load profiles after successful login
      await loadProfiles();
    } catch (error) {
      console.error('Login failed', error);
      throw error;
    }
  };

  // Logout function
  const logout = async () => {
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
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  // Check subscription status
  const checkSubscription = () => {
    if (!subscriptionExpiresAt) return false;
    return new Date(subscriptionExpiresAt) > new Date();
  };

  // Update subscription
  const updateSubscription = async (expiryDate) => {
    try {
      const updatedUser = { ...user, isSubscribed: true, subscriptionExpiresAt: expiryDate };
      
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
      return false;
    }
  };

  // Initialize on mount
  useEffect(() => {
    loadUserFromStorage();
  }, []);

  // Check subscription status periodically
  useEffect(() => {
    const interval = setInterval(() => {
      if (subscriptionExpiresAt && new Date(subscriptionExpiresAt) < new Date()) {
        setIsSubscribed(false);
      }
    }, 60000); // Check every minute

    return () => clearInterval(interval);
  }, [subscriptionExpiresAt]);

  const value = {
    user,
    token,
    isSubscribed,
    subscriptionExpiresAt,
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