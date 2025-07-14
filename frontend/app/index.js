// frontend/index.js
import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import Constants from 'expo-constants';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://dating-app-3eba.onrender.com';

const Index = () => {
  const [redirectPath, setRedirectPath] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const token = await AsyncStorage.getItem('auth');

        if (!token) {
          setRedirectPath('/(authenticate)/login');
          setLoading(false);
          return;
        }

        // Verify token structure first
        let decoded;
        try {
          decoded = jwtDecode(token);
          if (!decoded.userId) {
            throw new Error('Invalid token structure');
          }
        } catch (decodeError) {
          console.error('Token decode error:', decodeError);
          throw new Error('Invalid token format');
        }

        // First verify the token with a lightweight endpoint
        try {
          await axios.get(`${API_BASE_URL}/api/auth/verify-token`, {
            headers: { Authorization: `Bearer ${token}` }
          });
        } catch (verifyError) {
          if (verifyError.response?.status === 400) {
            throw new Error('Invalid or expired token');
          }
          throw verifyError;
        }

        // Get user data with retry logic
        let user;
        try {
          const response = await axios.get(`${API_BASE_URL}/api/users/${decoded.userId}`, {
            headers: { Authorization: `Bearer ${token}` },
            timeout: 5000 // 5 second timeout
          });
          user = response.data;
        } catch (userError) {
          if (userError.response?.status === 400) {
            // Handle malformed request cases
            throw new Error('Invalid user data request');
          }
          throw userError;
        }

        // Handle subscription status
        const updatedUser = { ...user };
        if (user.subscriptionExpiresAt) {
          updatedUser.isSubscribed = new Date(user.subscriptionExpiresAt) > new Date();
        }

        await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
        setRedirectPath('/(tabs)/bio');

      } catch (error) {
        console.error('Initialization error:', error);
        
        // Clear invalid auth data
        await Promise.all([
          AsyncStorage.removeItem('auth'),
          AsyncStorage.removeItem('user')
        ]);

        // Handle specific error cases
        if (error.message.includes('Invalid token') || 
            error.response?.status === 401) {
          setRedirectPath('/(authenticate)/login?error=invalid_token');
        } else if (error.response?.status === 400) {
          setRedirectPath('/(authenticate)/login?error=bad_request');
        } else if (error.response?.status === 404) {
          setRedirectPath('/(authenticate)/register');
        } else if (error.message.includes('network') || 
                 error.message.includes('timeout')) {
          setRedirectPath('/(authenticate)/login?error=network');
        } else {
          setRedirectPath('/(authenticate)/login?error=unknown');
        }
      } finally {
        setLoading(false);
      }
    };

    initializeApp();
  }, []);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return redirectPath ? <Redirect href={redirectPath} /> : null;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff'
  }
});

export default Index;