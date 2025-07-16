// app/config.js
// app/_config/index.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// ==================== PRODUCTION CONFIGURATION ====================
export const API_BASE_URL = 'https://dating-app-3eba.onrender.com';
export const API_TIMEOUT = 15000; // 15 seconds timeout

// Enhanced API Endpoints with dynamic path support
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    PROFILE: '/api/auth/profile',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh',
    VERIFY_EMAIL: '/api/auth/verify-email',
    RESET_PASSWORD: '/api/auth/reset-password'
  },
  USERS: {
    BASE: '/api/users',
    GET_ONE: (userId) => `/api/users/${userId}`,
    UPDATE: (userId) => `/api/users/${userId}`,
    UPDATE_GENDER: (userId) => `/api/users/${userId}/gender`,
    UPDATE_DESCRIPTION: (userId) => `/api/users/${userId}/description`,
    PROFILE_IMAGES: (userId) => `/api/users/${userId}/profile-images`,
    SUBSCRIPTION: (userId) => `/api/users/${userId}/subscribe`,
    SUBSCRIPTION_STATUS: (userId) => `/api/users/${userId}/subscription-status`,
    PREFERENCES: '/api/users/preferences',
    SEARCH: '/api/users/search',
    DELETE: (userId) => `/api/users/${userId}`
  },
  MATCHES: {
    BASE: '/api/matches',
    LIKE: '/api/matches/like',
    UNLIKE: '/api/matches/unlike',
    GET_MATCHES: '/api/matches',
    GET_LIKES: '/api/matches/likes'
  },
  CHAT: {
    CONVERSATIONS: '/api/chat/conversations',
    MESSAGES: (conversationId) => `/api/chat/messages/${conversationId}`,
    SEND: '/api/chat/send',
    READ: (messageId) => `/api/chat/messages/${messageId}/read`
  },
  NOTIFICATIONS: {
    BASE: '/api/notifications',
    READ: (notificationId) => `/api/notifications/${notificationId}/read`
  },
  PAYMENTS: {
    INITIATE: '/api/payments/initiate',
    VERIFY: '/api/payments/verify',
    HISTORY: '/api/payments/history'
  },
  MEDIA: {
    UPLOAD: '/api/media/upload',
    DELETE: (mediaId) => `/api/media/${mediaId}`
  }
};

// Enhanced Authentication Configuration
export const AUTH_CONFIG = {
  TOKEN_KEY: 'authToken',
  REFRESH_TOKEN_KEY: 'refreshToken',
  TOKEN_EXPIRY_BUFFER: 300000, // 5 minutes buffer
  PERSIST_USER_KEY: 'currentUser'
};

// Improved headers with version and platform info
export const getHeaders = async (additionalHeaders = {}) => {
  const token = await AsyncStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token || ''}`,
    'X-App-Version': Constants.expoConfig?.version || '1.0.0',
    'X-Platform': Constants.platform?.os || 'mobile',
    'X-Device-Id': Constants.deviceId || 'unknown',
    ...additionalHeaders
  };
};

// Production Services Configuration
export const SERVICES = {
  SENTRY: {
    DSN: Constants.expoConfig?.extra?.sentryDsn || '',
    ENABLED: true,
    TRACES_SAMPLE_RATE: 0.2
  },
  ANALYTICS: {
    GOOGLE_ID: Constants.expoConfig?.extra?.analyticsId || 'UA-XXXXX-Y',
    ENABLED: true,
    LOG_LEVEL: 'info'
  },
  RECAPTCHA: {
    SITE_KEY: Constants.expoConfig?.extra?.recaptchaKey || '6LeIxAcTAAAAAJcZVRqyHh71UMIEGNQ_MXjiZKhI',
    ENABLED: false
  }
};

// Production Feature Flags
export const FEATURE_FLAGS = {
  PREMIUM: {
    ENABLED: true,
    REQUIRE_SUBSCRIPTION: true,
    MAX_FREE_PHOTOS: 7,
    MAX_FREE_LIKES: 50
  },
  VIDEO_CALL: {
    ENABLED: false,
    MAX_DURATION: 30, // minutes
    REQUIRE_BOTH_PREMIUM: true
  },
  NOTIFICATIONS: {
    PUSH_ENABLED: true,
    EMAIL_ENABLED: true,
    IN_APP_ENABLED: true
  },
  OFFLINE_MODE: {
    ENABLED: false,
    CACHE_DURATION: 3600 // 1 hour in seconds
  }
};

// Subscription Configuration
export const SUBSCRIPTION = {
  PLANS: {
    BASIC: {
      PRICE: 10,
      DURATION: 30, // days
      FEATURES: ['unlimited_likes', 'view_all_photos']
    },
    PREMIUM: {
      PRICE: 25,
      DURATION: 90, // days
      FEATURES: ['video_calls', 'priority_matching', 'read_receipts']
    }
  },
  PAYMENT_METHODS: ['mpesa', 'card', 'paypal']
};

// Debugging (will be tree-shaken in production)
if (__DEV__) {
  console.log('[PROD] App Configuration Loaded');
  console.log('[PROD] API Base:', API_BASE_URL);
  console.log('[PROD] Environment:', Constants.expoConfig?.extra?.env || 'production');
}

// Configuration Validation
if (!API_BASE_URL) {
  console.error('❌ API_BASE_URL is not configured');
  throw new Error('API base URL is required');
}