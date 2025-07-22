// frontend/index.js
// frontend/app/index.js
import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import Constants from 'expo-constants';
import { ActivityIndicator, View, StyleSheet } from 'react-native';

import { AuthProvider } from './_context/AuthContext'; // ✅ Make sure this path is correct

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://dating-app-3eba.onrender.com';

// Axios defaults
axios.defaults.baseURL = API_BASE_URL;
axios.defaults.timeout = 10000;

axios.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;

      try {
        const refreshToken = await AsyncStorage.getItem('refreshToken');
        if (!refreshToken) throw new Error('No refresh token available');

        const response = await axios.post('/api/auth/refresh-token', { refreshToken });
        const newToken = response.data.token;

        await AsyncStorage.setItem('auth', newToken);
        if (response.data.refreshToken) {
          await AsyncStorage.setItem('refreshToken', response.data.refreshToken);
        }

        axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
        originalRequest.headers['Authorization'] = `Bearer ${newToken}`;

        return axios(originalRequest);
      } catch (refreshError) {
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

const AppInitializer = () => {
  const [redirectPath, setRedirectPath] = useState(null);
  const [loading, setLoading] = useState(true);

  const verifyToken = async (token) => {
    try {
      const response = await axios.get('/api/auth/verify-token', {
        headers: { Authorization: `Bearer ${token}` }
      });
      return response.data.valid;
    } catch {
      return false;
    }
  };

  const fetchUserData = async (userId, token) => {
    const response = await axios.get(`/api/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    return response.data;
  };

  const initializeApp = async () => {
    try {
      const token = await AsyncStorage.getItem('auth');
      if (!token) {
        setRedirectPath('/(authenticate)/login');
        return;
      }

      let decoded;
      try {
        decoded = jwtDecode(token);
        if (!decoded.userId) throw new Error('Invalid token');
      } catch {
        throw new Error('Invalid token format');
      }

      const isValid = await verifyToken(token);
      if (!isValid) throw new Error('Token expired');

      axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
      const user = await fetchUserData(decoded.userId, token);

      const updatedUser = {
        ...user,
        isSubscribed: user.subscriptionExpiresAt
          ? new Date(user.subscriptionExpiresAt) > new Date()
          : false
      };

      await AsyncStorage.setItem('user', JSON.stringify(updatedUser));

      if (!updatedUser.profileComplete) {
        setRedirectPath('/(tabs)/bio');
      } else {
        setRedirectPath('/(tabs)/profile');
      }

    } catch (error) {
      await Promise.all([
        AsyncStorage.removeItem('auth'),
        AsyncStorage.removeItem('refreshToken'),
        AsyncStorage.removeItem('user')
      ]);

      let errorPath = '/(authenticate)/login';

      if (error.message.includes('Invalid token')) {
        errorPath += '?error=invalid_token';
      } else if (error.response?.status === 404) {
        errorPath = '/(authenticate)/register';
      } else if (error.message.includes('network')) {
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

export default function Index() {
  return (
    <AuthProvider>
      <AppInitializer />
    </AuthProvider>
  );
}
