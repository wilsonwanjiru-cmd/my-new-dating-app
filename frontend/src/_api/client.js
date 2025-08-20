// frontend/app/_api/client.js

// frontend/app/_api/client.js
import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT, AUTH_CONFIG, getHeaders } from '../_config';

// Update base URL to your Render production URL
const PRODUCTION_URL = 'https://dating-app-3eba.onrender.com';

const client = axios.create({
  baseURL: PRODUCTION_URL, // Now using production URL
  timeout: API_TIMEOUT,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json'
  }
});

let isRefreshing = false;
let failedQueue = [];
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000;

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

// Request Interceptor
client.interceptors.request.use(
  async config => {
    // Skip auth for authentication endpoints
    if (config.url.includes('/auth/')) return config;

    try {
      const token = await AsyncStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
      if (token) {
        config.headers = {
          ...config.headers,
          'Authorization': `Bearer ${token}`,
          ...await getHeaders()
        };
      }
      
      // Add unique request ID for tracking
      config.headers['X-Request-ID'] = Math.random().toString(36).substring(7);
      return config;
    } catch (error) {
      console.error('Request interceptor error:', error);
      return Promise.reject(error);
    }
  },
  error => Promise.reject(error)
);

// Response Interceptor
client.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;

    // Handle network errors
    if (!error.response || !originalRequest) {
      return Promise.reject({
        ...error,
        message: error.message || 'Network error. Please check your internet connection.'
      });
    }

    // Handle timeout/connection issues
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      if (!originalRequest._retryCount) {
        originalRequest._retryCount = 1;
        return new Promise(resolve => {
          setTimeout(() => resolve(client(originalRequest)), RETRY_DELAY);
        });
      }
      return Promise.reject({
        ...error,
        message: 'Network request failed. Please try again.'
      });
    }

    // Handle token expiration (401 errors)
    if (error.response.status === 401 && !originalRequest._retry) {
      // Skip auth endpoints
      if (originalRequest.url.includes('/auth/')) return Promise.reject(error);

      // Queue requests while refreshing
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers.Authorization = `Bearer ${token}`;
          return client(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
        if (!refreshToken) throw new Error('No refresh token available');

        // Refresh token request
        const response = await axios.post(
          `${PRODUCTION_URL}/auth/refresh-token`,
          { refreshToken },
          {
            headers: await getHeaders(),
            skipAuthRefresh: true
          }
        );

        const { token: newToken, refreshToken: newRefreshToken } = response.data;

        // Store new tokens
        await Promise.all([
          AsyncStorage.setItem(AUTH_CONFIG.TOKEN_KEY, newToken),
          AsyncStorage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, newRefreshToken)
        ]);

        // Update original request header
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        // Process queued requests
        processQueue(null, newToken);
        return client(originalRequest);
      } catch (refreshError) {
        // Clear tokens on refresh failure
        processQueue(refreshError);
        if (refreshError.response?.status === 401) {
          await Promise.all([
            AsyncStorage.removeItem(AUTH_CONFIG.TOKEN_KEY),
            AsyncStorage.removeItem(AUTH_CONFIG.REFRESH_TOKEN_KEY),
            AsyncStorage.removeItem(AUTH_CONFIG.PERSIST_USER_KEY)
          ]);
        }
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // Standard error handling
    let errorMessage = error.response.data?.message || 'An unexpected error occurred';
    switch (error.response.status) {
      case 400: errorMessage = 'Invalid request'; break;
      case 403: errorMessage = 'Unauthorized action'; break;
      case 404: errorMessage = 'Resource not found'; break;
      case 429: errorMessage = 'Too many requests. Please slow down.'; break;
      case 500: errorMessage = 'Server error. Please try again later.'; break;
    }

    // Retry server errors
    if (
      error.response.status >= 500 &&
      (!originalRequest._retryCount || originalRequest._retryCount < MAX_RETRIES)
    ) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      const delay = RETRY_DELAY * originalRequest._retryCount;

      return new Promise(resolve => {
        setTimeout(() => resolve(client(originalRequest)), delay);
      });
    }

    // Format final error
    const apiError = new Error(errorMessage);
    apiError.status = error.response.status;
    apiError.data = error.response.data;
    return Promise.reject(apiError);
  }
);

// Health Check
client.checkConnection = async () => {
  try {
    const response = await axios.get(`${PRODUCTION_URL}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('Backend health check failed:', error);
    return false;
  }
};

// Fetch User Profile
client.fetchProfile = async () => {
  try {
    const response = await client.get('/api/user/profile');
    return response.data;
  } catch (error) {
    console.error('Profile fetch error:', error);
    throw error;
  }
};

export default client;