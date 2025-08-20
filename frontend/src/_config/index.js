// app/_config/index.js
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';

// ==================== PRODUCTION CONFIGURATION ====================
export const API_BASE_URL = 'https://dating-app-3eba.onrender.com'; // No trailing slash!
export const API_TIMEOUT = 15000; // 15 seconds timeout
export const MAX_API_RETRIES = 2; // Maximum retry attempts for failed requests
export const API_RETRY_DELAY = 1000; // 1 second between retries

// Enhanced API Endpoints with absolute paths
export const API_ENDPOINTS = {
  AUTH: {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    LOGOUT: '/api/auth/logout',
    REFRESH: '/api/auth/refresh-token',
    VERIFY_EMAIL: '/api/auth/verify-email',
    RESET_PASSWORD: '/api/auth/reset-password',
    HEALTH_CHECK: '/api/health'
  },
  USERS: {
    BASE: '/api/users',
    PROFILE: '/api/users/profile', // ✅ Corrected from /api/auth/profile
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
    HISTORY: '/api/payments/history',
    SUBSCRIBE: '/api/payments/subscribe'
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
  TOKEN_EXPIRY_BUFFER: 300000,
  PERSIST_USER_KEY: 'currentUser',
  TOKEN_REFRESH_THRESHOLD: 60000
};

// Improved headers with version and platform info
export const getHeaders = async (additionalHeaders = {}) => {
  const token = await AsyncStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
  return {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': token ? `Bearer ${token}` : '',
    'X-App-Version': Constants.expoConfig?.version || '1.0.0',
    'X-Platform': Constants.platform?.os || 'mobile',
    'X-Device-Id': Constants.deviceId || 'unknown',
    'X-Request-Source': 'mobile-app',
    ...additionalHeaders
  };
};

// Connection Monitoring Configuration
export const CONNECTION_CONFIG = {
  HEALTH_CHECK_INTERVAL: 30000,
  HEALTH_CHECK_TIMEOUT: 5000,
  OFFLINE_RETRY_INTERVAL: 10000
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
    MAX_FREE_LIKES: 50,
    FREE_TRIAL_DAYS: 0
  },
  VIDEO_CALL: {
    ENABLED: false,
    MAX_DURATION: 30,
    REQUIRE_BOTH_PREMIUM: true
  },
  NOTIFICATIONS: {
    PUSH_ENABLED: true,
    EMAIL_ENABLED: true,
    IN_APP_ENABLED: true,
    MESSAGE_PREVIEW_FREE: false
  },
  OFFLINE_MODE: {
    ENABLED: false,
    CACHE_DURATION: 3600
  }
};

// Subscription Configuration
export const SUBSCRIPTION = {
  PLANS: {
    BASIC_24HR: {
      PRICE: 10,
      DURATION: 24,
      FEATURES: [
        'unlimited_messaging',
        'unlimited_photo_uploads',
        'view_full_profiles',
        'see_who_liked_you'
      ],
      PAYMENT_METHODS: ['mpesa']
    },
    PREMIUM_7DAY: {
      PRICE: 50,
      DURATION: 168,
      FEATURES: [
        'priority_in_search',
        'read_receipts',
        'boosted_profile'
      ],
      PAYMENT_METHODS: ['mpesa', 'card']
    }
  },
  DEFAULT_PLAN: 'BASIC_24HR'
};

// Debugging configuration
export const DEBUG_CONFIG = {
  LOG_API_CALLS: __DEV__,
  LOG_API_RESPONSES: __DEV__,
  LOG_AUTH_FLOW: __DEV__,
  MOCK_API_RESPONSES: false
};

// Configuration validation and logging
if (__DEV__) {
  console.log('[CONFIG] App Configuration Loaded');
  console.log('[CONFIG] API Base:', API_BASE_URL);
  console.log('[CONFIG] Environment:', Constants.expoConfig?.extra?.env || 'production');

  if (!API_BASE_URL) {
    console.error('❌ Critical Error: API_BASE_URL is not configured');
    throw new Error('API base URL is required');
  }

  if (!API_ENDPOINTS.AUTH.LOGIN) {
    console.error('❌ Critical Error: Login endpoint not configured');
    throw new Error('Login endpoint is required');
  }
}

// Helper function to build full API URLs
export const buildApiUrl = (endpoint) => {
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  return `${API_BASE_URL}${endpoint}`;
};
