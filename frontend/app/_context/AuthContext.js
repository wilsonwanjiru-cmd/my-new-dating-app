import React, { createContext, useState, useEffect, useContext, useCallback } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { API_BASE_URL, API_ENDPOINTS, AUTH_CONFIG } from "../_config";

// Constants for free tier limits
const FREE_PHOTO_LIMIT = 7;
const FREE_PHOTO_RESET_HOURS = 24;

// Create context
const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [state, setState] = useState({
    user: null,
    token: null,
    isLoading: true,
    error: null,
    freePhotosViewed: 0,
    lastPhotoViewDate: null,
    freePhotosLimit: FREE_PHOTO_LIMIT
  });

  // Check if photo views should reset (24h passed)
  const shouldResetPhotoViews = useCallback((lastDate) => {
    if (!lastDate) return true;
    const lastView = new Date(lastDate);
    const now = new Date();
    const hoursDiff = (now - lastView) / (1000 * 60 * 60);
    return hoursDiff >= FREE_PHOTO_RESET_HOURS;
  }, []);

  // Initialize auth state
  const initializeAuth = useCallback(async () => {
    try {
      const [token, user, lastViewDate, viewedCount] = await Promise.all([
        AsyncStorage.getItem(AUTH_CONFIG.TOKEN_KEY),
        AsyncStorage.getItem(AUTH_CONFIG.PERSIST_USER_KEY),
        AsyncStorage.getItem('lastPhotoViewDate'),
        AsyncStorage.getItem('freePhotosViewed')
      ]);

      const shouldReset = shouldResetPhotoViews(lastViewDate);
      const initialCount = shouldReset ? 0 : (parseInt(viewedCount) || 0);

      setState({
        user: user ? JSON.parse(user) : null,
        token,
        isLoading: false,
        error: null,
        freePhotosViewed: initialCount,
        lastPhotoViewDate: shouldReset ? null : lastViewDate,
        freePhotosLimit: FREE_PHOTO_LIMIT
      });

      if (shouldReset) {
        await AsyncStorage.multiSet([
          ['freePhotosViewed', '0'],
          ['lastPhotoViewDate', new Date().toISOString()]
        ]);
      }
    } catch (error) {
      console.error('Auth initialization error:', error);
      setState(prev => ({ 
        ...prev, 
        isLoading: false, 
        error: error.message 
      }));
    }
  }, [shouldResetPhotoViews]);

  // Track photo view
  const incrementPhotoView = useCallback(async () => {
    const newCount = state.freePhotosViewed + 1;
    setState(prev => ({
      ...prev,
      freePhotosViewed: newCount
    }));
    await AsyncStorage.setItem('freePhotosViewed', newCount.toString());
  }, [state.freePhotosViewed]);

  // Check if can view more photos
  const canViewMorePhotos = useCallback(() => {
    return state.freePhotosViewed < FREE_PHOTO_LIMIT;
  }, [state.freePhotosViewed]);

  // Login function
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

      const { user, token } = response.data;

      await Promise.all([
        AsyncStorage.setItem(AUTH_CONFIG.PERSIST_USER_KEY, JSON.stringify(user)),
        AsyncStorage.setItem(AUTH_CONFIG.TOKEN_KEY, token),
        AsyncStorage.setItem('lastPhotoViewDate', new Date().toISOString()),
        AsyncStorage.setItem('freePhotosViewed', '0')
      ]);

      setState({
        user,
        token,
        isLoading: false,
        error: null,
        freePhotosViewed: 0,
        lastPhotoViewDate: new Date().toISOString(),
        freePhotosLimit: FREE_PHOTO_LIMIT
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
      ]);

      setState({
        user: null,
        token: null,
        isLoading: false,
        error: null,
        freePhotosViewed: 0,
        lastPhotoViewDate: null,
        freePhotosLimit: FREE_PHOTO_LIMIT
      });
    } catch (error) {
      console.error('Logout error:', error);
      setState(prev => ({ ...prev, error: error.message }));
    }
  }, []);

  // Initialize on mount
  useEffect(() => {
    initializeAuth();
  }, [initializeAuth]);

  // Context value
  const value = {
    ...state,
    login,
    logout,
    incrementPhotoView,
    canViewMorePhotos,
    getAuthToken: () => state.token,
    getRemainingPhotoViews: () => FREE_PHOTO_LIMIT - state.freePhotosViewed
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