// frontend/app/_api/client.js
// frontend/app/_api/client.js
import axios from 'axios';
import { API_BASE_URL, API_TIMEOUT, AUTH_CONFIG } from '../_config';
import { getHeaders } from '../_config';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Create axios instance with default config
const client = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
});

// Request queue for token refresh
let isRefreshing = false;
let failedQueue = [];
const MAX_RETRIES = 2;
const RETRY_DELAY = 1000; // 1 second

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

// Enhanced request interceptor
client.interceptors.request.use(
  async config => {
    // Skip modification for auth endpoints
    if (config.url.includes('/auth/')) {
      return config;
    }

    try {
      // Get token from AsyncStorage directly for better reliability
      const token = await AsyncStorage.getItem(AUTH_CONFIG.TOKEN_KEY);
      
      if (token) {
        config.headers = {
          ...config.headers,
          Authorization: `Bearer ${token}`,
          ...await getHeaders(),
        };
      }

      // Add request ID for tracking
      config.headers['X-Request-ID'] = Math.random().toString(36).substring(7);
      
      return config;
    } catch (error) {
      console.error('Request interceptor error:', error);
      return Promise.reject(error);
    }
  },
  error => Promise.reject(error)
);

// Enhanced response interceptor with retry logic
client.interceptors.response.use(
  response => response,
  async error => {
    const originalRequest = error.config;
    
    // If we don't have a response or the request has no config, reject
    if (!error.response || !originalRequest) {
      return Promise.reject(error);
    }

    // Handle network errors differently
    if (error.code === 'ECONNABORTED' || error.message === 'Network Error') {
      if (!originalRequest._retryCount) {
        originalRequest._retryCount = 1;
        return new Promise(resolve => {
          setTimeout(() => resolve(client(originalRequest)), RETRY_DELAY);
        });
      }
      return Promise.reject({
        ...error,
        message: 'Network error. Please check your connection.'
      });
    }

    // Handle 401 (Unauthorized) errors
    if (error.response.status === 401 && !originalRequest._retry) {
      // Skip refresh for auth endpoints
      if (originalRequest.url.includes('/auth/')) {
        return Promise.reject(error);
      }

      // If already refreshing, add to queue
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        })
          .then(token => {
            originalRequest.headers.Authorization = `Bearer ${token}`;
            return client(originalRequest);
          })
          .catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const refreshToken = await AsyncStorage.getItem(AUTH_CONFIG.REFRESH_TOKEN_KEY);
        if (!refreshToken) {
          throw new Error('No refresh token available');
        }

        // Refresh token request
        const response = await axios.post(`${API_BASE_URL}/auth/refresh-token`, {
          refreshToken
        }, {
          headers: await getHeaders(),
          skipAuthRefresh: true // Custom flag to prevent infinite loops
        });

        const { token: newToken, refreshToken: newRefreshToken } = response.data;

        // Store new tokens
        await Promise.all([
          AsyncStorage.setItem(AUTH_CONFIG.TOKEN_KEY, newToken),
          AsyncStorage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, newRefreshToken)
        ]);

        // Update the original request
        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        
        // Process queued requests
        processQueue(null, newToken);
        
        // Retry the original request
        return client(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError);
        
        // If refresh failed with 401, clear auth data
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

    // Handle other error statuses
    switch (error.response.status) {
      case 400:
        error.message = error.response.data?.message || 'Bad request';
        break;
      case 403:
        error.message = 'You are not authorized to perform this action';
        break;
      case 404:
        error.message = 'The requested resource was not found';
        break;
      case 429:
        error.message = 'Too many requests. Please wait before trying again.';
        break;
      case 500:
        error.message = 'Server error. Please try again later.';
        break;
      default:
        error.message = error.response.data?.message || 'Request failed';
    }

    // Add retry logic for server errors (5xx)
    if (error.response.status >= 500 && 
        (!originalRequest._retryCount || originalRequest._retryCount < MAX_RETRIES)) {
      originalRequest._retryCount = (originalRequest._retryCount || 0) + 1;
      
      return new Promise(resolve => {
        setTimeout(() => resolve(client(originalRequest)), 
        RETRY_DELAY * originalRequest._retryCount);
      });
    }

    return Promise.reject(error);
  }
);

// Add a method for health checks
client.checkConnection = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`, {
      timeout: 5000
    });
    return response.status === 200;
  } catch (error) {
    return false;
  }
};

export default client;