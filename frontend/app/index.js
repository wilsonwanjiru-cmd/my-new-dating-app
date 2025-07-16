// frontend/index.js
// frontend/index.js
import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import Constants from 'expo-constants';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://dating-app-3eba.onrender.com';

// Configure axios defaults
axios.defaults.baseURL = API_BASE_URL;
axios.defaults.timeout = 10000; // 10 second timeout

// Add response interceptor for handling 401 errors
axios.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    // If 401 error and we haven't already retried
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      
      try {
        // Attempt to refresh token
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token available');
        
        const response = await axios.post('/api/auth/refresh-token', { refreshToken });
        const newToken = response.data.token;
        
        // Store new tokens
        await AsyncStorage.setItem('auth', newToken);
        if (response.data.refreshToken) {
          await AsyncStorage.setItem('refreshToken', response.data.refreshToken);
        }
        
        // Update axios defaults with new token
        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;
        
        // Retry the original request
        return axios(originalRequest);
      } catch (refreshError) {
        console.error('Token refresh failed:', refreshError);
        // Clear all auth data if refresh fails
        await Promise.all([
          AsyncStorage.removeItem('auth'),
          AsyncStorage.removeItem('refreshToken'),
          AsyncStorage.removeItem('user')
        ]);
        throw refreshError;
      }
    }
    
    return Promise.reject(error);
  }
);

const Index = () => {
  const [redirectPath, setRedirectPath] = useState(null);
  const [loading, setLoading] = useState(true);

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('/api/auth/verify-token', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data.valid;
    } catch (error) {
      console.error('Token verification failed:', error);
      return false;
    }
  };

  const fetchUserData = async (userId, token) => {
    try {
      const response = await axios.get(`/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data;
    } catch (error) {
      console.error('Failed to fetch user data:', error);
      throw error;
    }
  };

  const initializeApp = async () => {
    try {
      const token = await AsyncStorage.getItem('auth');
      
      if (!token) {
        setRedirectPath('/(authenticate)/login');
        return;
      }

      // Verify token structure
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

      // Verify token with server
      const isTokenValid = await verifyToken(token);
      if (!isTokenValid) {
        throw new Error('Invalid or expired token');
      }

      // Set axios auth header
      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;

      // Get user data
      const user = await fetchUserData(decoded.userId, token);
      const updatedUser = { 
        ...user,
        isSubscribed: user.subscriptionExpiresAt 
          ? new Date(user.subscriptionExpiresAt) > new Date()
          : false
      };

      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));
      
      // Determine where to redirect based on user state
      if (!updatedUser.profileComplete) {
        setRedirectPath('/(tabs)/bio');
      } else {
        setRedirectPath('/(tabs)/profile');
      }

    } catch (error) {
      console.error('Initialization error:', error);
      
      // Clear invalid auth data
      await Promise.all([
        AsyncStorage.removeItem('auth'),
        AsyncStorage.removeItem('refreshToken'),
        AsyncStorage.removeItem('user')
      ]);

      // Handle specific error cases
      let errorPath = '/(authenticate)/login';
      if (error.message.includes('Invalid token') || error.response?.status === 401) {
        errorPath += '?error=invalid_token';
      } else if (error.response?.status === 400) {
        errorPath += '?error=bad_request';
      } else if (error.response?.status === 404) {
        errorPath = '/(authenticate)/register';
      } else if (error.message.includes('network') || error.message.includes('timeout')) {
        errorPath += '?error=network';
      } else {
        errorPath += '?error=unknown';
      }
      
      setRedirectPath(errorPath);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
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