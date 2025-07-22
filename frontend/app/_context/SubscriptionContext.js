// frontend/app/_context/SubscriptionContext.js
import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../_config';
import { useAuth } from './AuthContext';

// Constants
const SUBSCRIPTION_CHECK_INTERVAL = 300000; // 5 minutes
const SUBSCRIPTION_EXPIRY_BUFFER = 60000; // 1 minute buffer
const FREE_TIER_LIMITS = {
  profileViews: 5,
  messages: 3,
  photoUploads: 5
};

// Create context
const SubscriptionContext = createContext();

export const SubscriptionProvider = ({ children }) => {
  const { user, getAuthToken } = useAuth();
  const [state, setState] = useState({
    isSubscribed: false,
    subscriptionType: null,
    expiresAt: null,
    isLoading: true,
    error: null,
    usage: {
      profileViews: 0,
      messagesSent: 0,
      photosUploaded: 0
    }
  });

  // Check subscription status with backend
  const checkSubscriptionStatus = useCallback(async () => {
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required');

      const response = await fetch(`${API_BASE_URL}/api/subscriptions/status`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (!response.ok) throw new Error('Failed to check subscription');

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Subscription check failed:', error);
      throw error;
    }
  }, [getAuthToken]);

  // Purchase subscription
  const purchaseSubscription = useCallback(async (type = 'daily') => {
    try {
      const token = await getAuthToken();
      if (!token) throw new Error('Authentication required');

      setState(prev => ({ ...prev, isLoading: true }));

      const response = await fetch(`${API_BASE_URL}/api/subscriptions/purchase`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ type })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Purchase failed');
      }

      const result = await response.json();
      
      await AsyncStorage.setItem('subscription', JSON.stringify({
        isActive: true,
        type: result.type,
        expiresAt: result.expiresAt
      }));

      setState(prev => ({
        ...prev,
        isSubscribed: true,
        subscriptionType: result.type,
        expiresAt: result.expiresAt,
        isLoading: false,
        error: null
      }));

      return result;
    } catch (error) {
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: error.message
      }));
      throw error;
    }
  }, [getAuthToken]);

  // Track usage
  const trackUsage = useCallback(async (type) => {
    try {
      setState(prev => ({
        ...prev,
        usage: {
          ...prev.usage,
          [type]: prev.usage[type] + 1
        }
      }));

      // Sync with backend if subscribed
      if (state.isSubscribed) {
        const token = await getAuthToken();
        await fetch(`${API_BASE_URL}/api/subscriptions/usage`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ type })
        });
      }
    } catch (error) {
      console.error('Usage tracking failed:', error);
    }
  }, [state.isSubscribed, getAuthToken]);

  // Check if action is allowed
  const isActionAllowed = useCallback((actionType) => {
    if (state.isSubscribed) return true;
    
    const limit = FREE_TIER_LIMITS[actionType];
    const used = state.usage[actionType];
    
    return used < limit;
  }, [state.isSubscribed, state.usage]);

  // Initialize subscription state
  const initializeSubscription = useCallback(async () => {
    try {
      const storedSub = await AsyncStorage.getItem('subscription');
      const subscription = storedSub ? JSON.parse(storedSub) : null;
      
      if (subscription?.isActive) {
        const isStillActive = new Date(subscription.expiresAt) > new Date();
        
        setState(prev => ({
          ...prev,
          isSubscribed: isStillActive,
          subscriptionType: subscription.type,
          expiresAt: subscription.expiresAt,
          isLoading: false
        }));

        if (!isStillActive) {
          await AsyncStorage.removeItem('subscription');
        }
      } else {
        setState(prev => ({ ...prev, isLoading: false }));
      }
    } catch (error) {
      console.error('Initialization error:', error);
      setState(prev => ({ ...prev, isLoading: false, error: error.message }));
    }
  }, []);

  // Check subscription status periodically
  useEffect(() => {
    initializeSubscription();

    const interval = setInterval(() => {
      if (state.isSubscribed) {
        const expiresSoon = new Date(state.expiresAt) - new Date() < SUBSCRIPTION_EXPIRY_BUFFER;
        if (expiresSoon) {
          checkSubscriptionStatus();
        }
      }
    }, SUBSCRIPTION_CHECK_INTERVAL);

    return () => clearInterval(interval);
  }, [initializeSubscription, state.isSubscribed, state.expiresAt, checkSubscriptionStatus]);

  // Context value
  const value = {
    ...state,
    purchaseSubscription,
    checkSubscriptionStatus,
    trackUsage,
    isActionAllowed,
    FREE_TIER_LIMITS
  };

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

// Default export for Expo Router
export default SubscriptionProvider;