import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS, AUTH_CONFIG } from "../_config";

// Create context
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({
    user: null,
    token: null,
    isLoading: true,
    error: null,
    isSubscribed: false,
    subscriptionExpiresAt: null
  });

  // Initialize auth state
  const initializeAuth = useCallback(async () => {
    try {
      const [token, user, subscriptionData] = await Promise.all([
        AsyncStorage.getItem(AUTH_CONFIG.TOKEN_KEY),
        AsyncStorage.getItem(AUTH_CONFIG.PERSIST_USER_KEY),
        AsyncStorage.getItem('subscriptionData')
      ]);

      const parsedSubscription = subscriptionData ? JSON.parse(subscriptionData) : null;
      const isSubscribed = parsedSubscription?.isSubscribed || false;
      const subscriptionExpiresAt = parsedSubscription?.expiresAt || null;

      setState({
        user: user ? JSON.parse(user) : null,
        token,
        isLoading: false,
        error: null,
        isSubscribed,
        subscriptionExpiresAt
      });
    } catch (error) {
      console.error('Auth initialization error:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message 
      }));
    }
  }, []);

  // ✅ Login function with userId saved to AsyncStorage
  const login = useCallback(async (credentials) => {
    try {
      setState(prev => ({ ...prev, isLoading: true, error: null }));

      const response = await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.AUTH.LOGIN}`,
        credentials,
        {
          timeout: 10000 // 10 second timeout
        }
      );

      const { user, token, isSubscribed, subscriptionExpiresAt } = response.data;

      await Promise.all([
        AsyncStorage.setItem(AUTH_CONFIG.PERSIST_USER_KEY, JSON.stringify(user)),
        AsyncStorage.setItem(AUTH_CONFIG.TOKEN_KEY, token),
        AsyncStorage.setItem('subscriptionData', JSON.stringify({
          isSubscribed,
          expiresAt: subscriptionExpiresAt
        })),
        AsyncStorage.setItem('userId', user.id || user._id || '')
      ]);

      setState({
        user,
        token,
        isLoading: false,
        error: null,
        isSubscribed,
        subscriptionExpiresAt
      });

      return { success: true, user };
    } catch (error) {
      let errorMessage = 'Login failed. Please try again.';
      if (error.response) {
        errorMessage = error.response.data?.message || errorMessage;
      } else if (error.code === 'ECONNABORTED') {
        errorMessage = 'Request timeout. Check your connection.';
      }

      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMessage,
      }));
      
      return { success: false, error: errorMessage };
    }
  }, []);

  // Logout function
  const logout = useCallback(async () => {
    try {
      await Promise.all([
        AsyncStorage.removeItem(AUTH_CONFIG.PERSIST_USER_KEY),
        AsyncStorage.removeItem(AUTH_CONFIG.TOKEN_KEY),
        AsyncStorage.removeItem('userId'),
        AsyncStorage.removeItem('subscriptionData')
      ]);

      setState({
        user: null,
        token: null,
        isLoading: false,
        error: null,
        isSubscribed: false,
        subscriptionExpiresAt: null
      });
    } catch (error) {
      console.error('Logout error:', error);
      setState(prev => ({ ...prev, error: error.message }));
    }
  }, []);

  // Update user data
  const updateUser = useCallback(async (updatedUser) => {
    try {
      await AsyncStorage.setItem(
        AUTH_CONFIG.PERSIST_USER_KEY, 
        JSON.stringify(updatedUser)
      );
      
      setState(prev => ({
        ...prev,
        user: updatedUser
      }));
    } catch (error) {
      console.error('Update user error:', error);
      throw error;
    }
  }, []);

  // Like photo function
  const likePhoto = useCallback(async (photoId) => {
    try {
      const response = await axios.patch(
        `${API_BASE_URL}${API_ENDPOINTS.USERS.LIKE_PHOTO}/${photoId}`,
        {},
        {
          headers: {
            Authorization: `Bearer ${state.token}`
          }
        }
      );

      const updatedUser = response.data.user;
      await updateUser(updatedUser);
      
      return { success: true };
    } catch (error) {
      console.error('Like photo error:', error);
      return { success: false, error: error.message };
    }
  }, [state.token, updateUser]);

  // Start chat function
  const startChat = useCallback(async (userId) => {
    if (!state.isSubscribed) {
      return { success: false, error: 'Please subscribe to start chatting' };
    }

    try {
      const response = await axios.post(
        `${API_BASE_URL}${API_ENDPOINTS.CHAT.START}`,
        { recipientId: userId },
        {
          headers: {
            Authorization: `Bearer ${state.token}`
          }
        }
      );

      return { 
        success: true, 
        chatId: response.data.chatId 
      };
    } catch (error) {
      console.error('Start chat error:', error);
      return { success: false, error: error.message };
    }
  }, [state.isSubscribed, state.token]);

  // Initialize on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Context value
  const value = {
    ...state,
    login,
    logout,
    updateUser,
    likePhoto,
    startChat,
    getAuthToken: () => state.token
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

// Default export for Expo Router
export default AuthProvider;