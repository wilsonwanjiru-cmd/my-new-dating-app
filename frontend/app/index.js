// frontend/index.js
// frontend/app/index.js
import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { jwtDecode } from 'jwt-decode';
import axios from 'axios';
import Constants from 'expo-constants';

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl || 'https://dating-app-3eba.onrender.com';

const Index = () => {
  const [redirectPath, setRedirectPath] = useState(null);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        const token = await AsyncStorage.getItem('auth');

        if (!token) {
          setRedirectPath('/(authenticate)/login');
          return;
        }

        const decoded = jwtDecode(token);
        const userId = decoded.userId;

        const response = await axios.get(`${API_BASE_URL}/api/users/${userId}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const user = response.data;

        // Handle subscription expiration
        if (user.subscriptionExpiresAt) {
          const expiryDate = new Date(user.subscriptionExpiresAt);
          const now = new Date();

          if (expiryDate.getTime() < now.getTime()) {
            // Auto-expire in local storage if outdated
            await AsyncStorage.setItem(
              'user',
              JSON.stringify({
                ...user,
                isSubscribed: false,
              })
            );
          } else {
            await AsyncStorage.setItem('user', JSON.stringify(user));
          }
        }

        // Route authenticated users to tabs
        setRedirectPath('/(tabs)/bio');
      } catch (error) {
        console.error('Failed to initialize app:', error);
        await AsyncStorage.removeItem('auth');
        await AsyncStorage.removeItem('user');
        setRedirectPath('/(authenticate)/login');
      }
    };

    initializeApp();
  }, []);

  if (!redirectPath) {
    return null; // Or a splash screen
  }

  return <Redirect href={redirectPath} />;
};

export default Index;
