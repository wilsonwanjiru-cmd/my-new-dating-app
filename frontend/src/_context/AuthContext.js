// app/_context/AuthContext.js
import React, { createContext, useState, useEffect, useContext, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import api from "../_api/client";

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [gender, setGender] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(null);
  const [profileComplete, setProfileComplete] = useState(false);
  
  // Ref to track mounted state
  const isMounted = useRef(true);

  // Helper function to safely store values in AsyncStorage
  const safeSetItem = async (key, value) => {
    if (value === null || value === undefined) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, value);
    }
  };

  // Helper function to safely store JSON values
  const safeSetJsonItem = async (key, value) => {
    if (value === null || value === undefined) {
      await AsyncStorage.removeItem(key);
    } else {
      await AsyncStorage.setItem(key, JSON.stringify(value));
    }
  };

  // Initialize auth state
  const initializeAuth = useCallback(async () => {
    try {
      const [token, userData, gender, profileComplete, subscriptionData] = await Promise.all([
        AsyncStorage.getItem('authToken'),
        AsyncStorage.getItem('userData'),
        AsyncStorage.getItem('userGender'),
        AsyncStorage.getItem('profileComplete'),
        AsyncStorage.getItem('subscriptionData')
      ]);

      // Parse stored data
      const parsedUser = userData ? JSON.parse(userData) : null;
      const isProfileComplete = profileComplete ? JSON.parse(profileComplete) : false;
      
      // Parse subscription data
      let subscriptionActive = false;
      let subscriptionExpiry = null;
      
      if (subscriptionData) {
        try {
          const { isActive, expiresAt } = JSON.parse(subscriptionData);
          subscriptionActive = isActive;
          subscriptionExpiry = expiresAt ? new Date(expiresAt) : null;
        } catch (e) {
          console.error('Error parsing subscription data:', e);
        }
      }

      // Only update state if component is still mounted
      if (isMounted.current) {
        setToken(token);
        setUser(parsedUser);
        setGender(gender || parsedUser?.gender || null);
        setIsSubscribed(subscriptionActive);
        setSubscriptionExpiresAt(subscriptionExpiry);
        setProfileComplete(isProfileComplete);
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      if (isMounted.current) {
        setError(error.message);
      }
    } finally {
      if (isMounted.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Login function
  const login = useCallback(async (authData) => {
    try {
      setIsLoading(true);
      setError(null);
      
      const { token, user, refreshToken } = authData;
      const userGender = user.gender;
      const userProfileComplete = user.profileComplete || false;
      
      // Store all auth data safely
      await Promise.all([
        safeSetItem('authToken', token),
        safeSetItem('refreshToken', refreshToken),
        safeSetJsonItem('userData', user),
        safeSetItem('userGender', userGender),
        safeSetJsonItem('profileComplete', userProfileComplete)
      ]);

      // Update state
      setToken(token);
      setUser(user);
      setGender(userGender);
      setProfileComplete(userProfileComplete);
      
      return { success: true, user };
    } catch (error) {
      console.error('Login error:', error);
      setError(error.message);
      return { success: false, error: error.message };
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await AsyncStorage.multiRemove([
        'authToken',
        'refreshToken',
        'userData',
        'userGender',
        'profileComplete',
        'subscriptionData'
      ]);

      // Reset all state
      setUser(null);
      setToken(null);
      setGender(null);
      setIsSubscribed(false);
      setSubscriptionExpiresAt(null);
      setProfileComplete(false);
      setError(null);
    } catch (error) {
      console.error('Logout error:', error);
      setError(error.message);
    }
  }, []);

  // Update user function
  const updateUser = useCallback(async (updates) => {
    try {
      // Merge updates with existing user data
      const updatedUser = { ...user, ...updates };
      
      // Update state
      setUser(updatedUser);
      
      // Update AsyncStorage safely
      await safeSetJsonItem('userData', updatedUser);
      
      // Handle specific updates
      if (updates.gender !== undefined) {
        setGender(updates.gender);
        await safeSetItem('userGender', updates.gender);
      }
      
      if (updates.profileComplete !== undefined) {
        setProfileComplete(updates.profileComplete);
        await safeSetJsonItem('profileComplete', updates.profileComplete);
      }
      
      if (updates.isSubscribed !== undefined) {
        setIsSubscribed(updates.isSubscribed);
      }
      
      if (updates.subscriptionExpiresAt !== undefined) {
        setSubscriptionExpiresAt(updates.subscriptionExpiresAt);
      }
      
      return updatedUser;
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  }, [user]);

  // Update subscription function
  const updateSubscription = useCallback(async (isActive, expiresAt) => {
    try {
      setIsSubscribed(isActive);
      setSubscriptionExpiresAt(expiresAt);
      
      // Store subscription data safely
      await safeSetJsonItem('subscriptionData', {
        isActive,
        expiresAt: expiresAt ? expiresAt.toISOString() : null
      });
    } catch (error) {
      console.error('Update subscription error:', error);
      throw error;
    }
  }, []);

  // Like photo function
  const likePhoto = useCallback(async (photoId) => {
    try {
      if (!token) throw new Error('Not authenticated');
      
      const response = await api.post(
        `/api/likes/photos/${photoId}`,
        { isLike: true },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return response.data;
    } catch (error) {
      console.error('Like photo error:', error);
      throw error;
    }
  }, [token]);

  // Start chat function
  const startChat = useCallback(async (userId) => {
    try {
      if (!token) throw new Error('Not authenticated');
      if (!isSubscribed) throw new Error('Subscription required');
      
      const response = await api.post(
        '/api/chats/initiate',
        { recipientId: userId },
        { headers: { Authorization: `Bearer ${token}` } }
      );

      return response.data;
    } catch (error) {
      console.error('Start chat error:', error);
      throw error;
    }
  }, [token, isSubscribed]);

  // Initialize on mount
  useEffect(() => {
    isMounted.current = true;
    initializeAuth();
    
    return () => {
      isMounted.current = false;
    };
  }, [initializeAuth]);

  // Context value
  const value = {
    user,
    token,
    gender,
    isLoading,
    error,
    isSubscribed,
    subscriptionExpiresAt,
    profileComplete,
    login,
    logout,
    updateUser,
    updateSubscription,
    likePhoto,
    startChat
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
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

// Default export to satisfy Expo Router
export default function AuthContextWrapper() {
  return null;
}