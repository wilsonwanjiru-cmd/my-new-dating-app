// app/index.js
import React, { useEffect, useState } from 'react';
import { Redirect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import Constants from 'expo-constants';

// Update import paths to point to the new location in src directory
import { AuthProvider } from '../src/_context/AuthContext';
import { SocketProvider } from '../src/_context/SocketContext';
import { SubscriptionProvider } from '../src/_context/SubscriptionContext';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://dating-app-3eba.onrender.com';

const AppInitializer = () => {
  const [redirectPath, setRedirectPath] = useState(null);
  const [loading, setLoading] = useState(true);

  const initializeApp = async () => {
    try {
      // Check if we have authentication tokens
      const [authToken, refreshToken] = await Promise.all([
        AsyncStorage.getItem('authToken'),
        AsyncStorage.getItem('refreshToken')
      ]);

      if (!authToken || !refreshToken) {
        setRedirectPath('/(authenticate)/login');
        setLoading(false);
        return;
      }

      // Check if we have user data
      const userData = await AsyncStorage.getItem('userData');
      if (!userData) {
        setRedirectPath('/(authenticate)/login');
        setLoading(false);
        return;
      }

      // Parse user data
      const user = JSON.parse(userData);
      
      // Determine where to redirect based on user status
      if (!user.gender) {
        setRedirectPath('/(authenticate)/select');
      } else if (!user.profileComplete) {
        setRedirectPath('/(tabs)/profile');
      } else {
        setRedirectPath('/(tabs)/bio');
      }
      
    } catch (error) {
      console.error("Initialization error:", error);
      setRedirectPath('/(authenticate)/login');
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
        <ActivityIndicator size="large" color="#FF1493" />
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
      <SocketProvider>
        <SubscriptionProvider>
          <AppInitializer />
        </SubscriptionProvider>
      </SocketProvider>
    </AuthProvider>
  );
}