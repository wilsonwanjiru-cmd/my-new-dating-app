// frontend/app/_context/SubscriptionContext.js
// app/_context/SubscriptionContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuth } from './AuthContext';
import api from '../_api/client';

const SubscriptionContext = createContext();

export const SubscriptionProvider = ({ children }) => {
  const { user, updateUser } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  // Initialize from storage and context
  useEffect(() => {
    const loadSubscription = async () => {
      try {
        // First check if we have subscription data in context
        if (user?.isSubscribed && user?.subscriptionExpiresAt) {
          setIsSubscribed(user.isSubscribed);
          setSubscriptionExpiresAt(user.subscriptionExpiresAt);
          return;
        }
        
        // Fallback to AsyncStorage
        const storedData = await AsyncStorage.getItem('subscriptionData');
        if (storedData) {
          const { isActive, expiresAt } = JSON.parse(storedData);
          setIsSubscribed(isActive);
          setSubscriptionExpiresAt(expiresAt);
          
          // Update auth context if needed
          if (updateUser && user) {
            updateUser({
              isSubscribed: isActive,
              subscriptionExpiresAt: expiresAt
            });
          }
        }
      } catch (error) {
        console.error('Failed to load subscription:', error);
      }
    };

    loadSubscription();
  }, [user]);

  // Check subscription status periodically
  useEffect(() => {
    const checkSubscription = () => {
      if (!subscriptionExpiresAt) return;
      
      const now = new Date();
      const expires = new Date(subscriptionExpiresAt);
      
      if (now > expires) {
        handleSubscriptionExpired();
      }
    };
    
    // Check immediately on load
    checkSubscription();
    
    // Then check every 5 minutes
    const interval = setInterval(checkSubscription, 300000);
    return () => clearInterval(interval);
  }, [subscriptionExpiresAt]);

  const handleSubscriptionExpired = async () => {
    setIsSubscribed(false);
    setSubscriptionExpiresAt(null);
    
    if (updateUser) {
      await updateUser({
        isSubscribed: false,
        subscriptionExpiresAt: null
      });
    }
    
    await AsyncStorage.setItem('subscriptionData', JSON.stringify({
      isActive: false,
      expiresAt: null
    }));
  };

  const activateSubscription = async (subscriptionType = 'daily') => {
    try {
      setIsLoading(true);
      setError(null);
      
      // Call backend to process subscription
      const response = await api.post('/api/subscriptions/purchase', {
        subscriptionType
      });
      
      const { expiresAt } = response.data;
      const expiryDate = new Date(expiresAt);
      
      // Update local state
      setIsSubscribed(true);
      setSubscriptionExpiresAt(expiryDate);
      
      // Update auth context
      if (updateUser) {
        await updateUser({
          isSubscribed: true,
          subscriptionExpiresAt: expiryDate
        });
      }
      
      // Persist to storage
      await AsyncStorage.setItem('subscriptionData', JSON.stringify({
        isActive: true,
        expiresAt: expiryDate.toISOString()
      }));
      
      return true;
    } catch (err) {
      console.error('Subscription activation failed:', err);
      setError(err.response?.data?.message || 'Failed to activate subscription');
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  const getSubscriptionStatus = () => {
    if (!isSubscribed) return 'inactive';
    
    const now = new Date();
    const expires = new Date(subscriptionExpiresAt);
    
    if (now > expires) {
      handleSubscriptionExpired();
      return 'expired';
    }
    
    const hoursLeft = Math.ceil((expires - now) / (1000 * 60 * 60));
    
    if (hoursLeft > 12) return 'active';
    if (hoursLeft > 1) return 'expiring-soon';
    return 'expired';
  };

  const value = {
    isSubscribed,
    subscriptionExpiresAt,
    isLoading,
    error,
    activateSubscription,
    getSubscriptionStatus
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

// Default export to satisfy Expo Router
export default function SubscriptionContextWrapper() {
  return null;
}