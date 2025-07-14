// app/config.js

// frontend/app/config.js
import AsyncStorage from '@react-native-async-storage/async-storage';

// Production Configuration
export const API_BASE_URL = 'https://dating-app-3eba.onrender.com';

export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    PROFILE: '/api/auth/profile',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh'
  },
  USERS: {
    GET_ALL: '/api/users',
    GET_ONE: '/api/users/:id',
    UPDATE: '/api/users/:id',
    DELETE: '/api/users/:id',
    SEARCH: '/api/users/search'
  },
  MATCHES: {
    GET_MATCHES: '/api/matches',
    LIKE: '/api/matches/like',
    DISLIKE: '/api/matches/dislike'
  },
  CHAT: {
    CONVERSATIONS: '/api/chat/conversations',
    MESSAGES: '/api/chat/messages/:conversationId',
    SEND: '/api/chat/send'
  },
  MEDIA: {
    UPLOAD: '/api/media/upload',
    DELETE: '/api/media/:id'
  }
};

// Async function to get headers
export const getHeaders = async () => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json',
  'Authorization': `Bearer ${await AsyncStorage.getItem('token') || ''}`,
  'X-App-Version': '1.0.0',
  'X-Platform': 'mobile-web'
});

export const API_TIMEOUT = 15000; // 15 seconds

// Production services configuration
export const SENTRY_DSN = process.env.EXPO_PUBLIC_SENTRY_DSN || 'https://your-sentry-dsn.ingest.sentry.io/your-project-id';
export const ANALYTICS_ID = process.env.EXPO_PUBLIC_ANALYTICS_ID || 'UA-XXXXX-Y';
export const RECAPTCHA_SITE_KEY = process.env.EXPO_PUBLIC_RECAPTCHA_KEY || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI';

// Feature flags
export const FEATURE_FLAGS = {
  ENABLE_PREMIUM_FEATURES: true,
  ENABLE_VIDEO_CALLS: false,
  ENABLE_PUSH_NOTIFICATIONS: true
};

// Development-only logging
if (process.env.NODE_ENV !== 'production') {
  console.log('[DEV] App Configuration Loaded');
  console.log('[DEV] API Base:', API_BASE_URL);
}