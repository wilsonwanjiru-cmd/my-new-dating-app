// frontend/app/_api/client.js

import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL, API_TIMEOUT, AUTH_CONFIG, getHeaders } from '../_config';

const client = axios.create({
  baseURL: API_BASE_URL,
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

    if (!error.response || !originalRequest) {
      return Promise.reject({
        ...error,
        message: error.message || 'Network error occurred'
      });
    }

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

    if (error.response.status === 401 && !originalRequest._retry) {
      if (originalRequest.url.includes('/auth/')) return Promise.reject(error);

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

        const response = await axios.post(
          `${API_BASE_URL}/auth/refresh-token`,
          { refreshToken },
          {
            headers: await getHeaders(),
            skipAuthRefresh: true
          }
        );

        const { token: newToken, refreshToken: newRefreshToken } = response.data;

        await Promise.all([
          AsyncStorage.setItem(AUTH_CONFIG.TOKEN_KEY, newToken),
          AsyncStorage.setItem(AUTH_CONFIG.REFRESH_TOKEN_KEY, newRefreshToken)
        ]);

        originalRequest.headers.Authorization = `Bearer ${newToken}`;
        processQueue(null, newToken);
        return client(originalRequest);
      } catch (refreshError) {
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

    // Standard error messages
    let errorMessage = error.response.data?.message || 'An unexpected error occurred';
    switch (error.response.status) {
      case 400: errorMessage = 'Bad request'; break;
      case 403: errorMessage = 'Unauthorized action'; break;
      case 404: errorMessage = 'Resource not found'; break;
      case 429: errorMessage = 'Too many requests'; break;
      case 500: errorMessage = 'Server error'; break;
    }

    // Retry logic
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

    const apiError = new Error(errorMessage);
    apiError.status = error.response.status;
    apiError.data = error.response.data;
    return Promise.reject(apiError);
  }
);

// Health Check
client.checkConnection = async () => {
  try {
    const response = await axios.get(`${API_BASE_URL}/health`, { timeout: 5000 });
    return response.status === 200;
  } catch (error) {
    console.error('Health check failed:', error);
    return false;
  }
};

// Fetch Profile
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
