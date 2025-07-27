import axios from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_BASE_URL } from '../_config';

/**
 * Fetches the current user's profile using token from AsyncStorage
 * @returns {Promise<Object>} User profile data
 */
export const fetchProfile = async () => {
  try {
    const [userId, token] = await Promise.all([
      AsyncStorage.getItem('userId'),
      AsyncStorage.getItem('authToken')
    ]);

    if (!userId || !token) {
      throw new Error('Authentication data missing');
    }

    const response = await axios.get(`${API_BASE_URL}/auth/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000
    });

    return response.data;
  } catch (error) {
    console.error("Profile fetch error:", {
      endpoint: `${API_BASE_URL}/auth/users/[userId]`,
      status: error.response?.status,
      message: error.message,
      data: error.response?.data
    });

    // Convert specific errors to more user-friendly messages
    let errorMessage = error.response?.data?.message || error.message;
    
    if (error.response?.status === 401) {
      errorMessage = 'Session expired. Please login again.';
    } else if (error.code === 'ECONNABORTED') {
      errorMessage = 'Request timeout. Please check your connection.';
    } else if (!error.response) {
      errorMessage = 'Network error. Please check your internet connection.';
    }

    throw new Error(errorMessage);
  }
};

/**
 * Fetches any user's profile by ID
 * @param {string} userId - Target user ID
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} User profile data
 */
export const fetchUserById = async (userId, token) => {
  try {
    if (!userId || !token) {
      throw new Error('Missing required parameters');
    }

    const response = await axios.get(`${API_BASE_URL}/auth/users/${userId}`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8000
    });

    return response.data;
  } catch (error) {
    console.error("User fetch error:", {
      endpoint: `${API_BASE_URL}/auth/users/${userId}`,
      status: error.response?.status,
      message: error.message
    });

    let errorMessage = error.response?.data?.message || error.message;
    
    if (error.response?.status === 404) {
      errorMessage = 'User not found';
    }

    throw new Error(errorMessage);
  }
};

/**
 * Fetches all user profiles
 * @param {string} token - Authentication token
 * @returns {Promise<Array>} Array of user profiles
 */
export const fetchProfiles = async (token) => {
  try {
    if (!token) {
      throw new Error('Authentication token required');
    }

    const response = await axios.get(`${API_BASE_URL}/auth/users`, {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 10000
    });

    return response.data;
  } catch (error) {
    console.error("Profiles fetch error:", {
      endpoint: `${API_BASE_URL}/auth/users`,
      status: error.response?.status,
      message: error.message
    });

    throw new Error(
      error.response?.data?.message || 
      'Failed to fetch user profiles. Please try again later.'
    );
  }
};

/**
 * Updates user's gender
 * @param {string} userId - User ID to update
 * @param {string} gender - New gender value
 * @param {string} token - Authentication token
 * @returns {Promise<Object>} Updated user data
 */
export const updateUserGender = async (userId, gender, token) => {
  try {
    if (!userId || !gender || !token) {
      throw new Error('Missing required parameters');
    }

    const response = await axios.put(
      `${API_BASE_URL}/users/${userId}/gender`,
      { gender },
      {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        timeout: 5000
      }
    );

    return response.data;
  } catch (error) {
    console.error("Gender update error:", {
      endpoint: `${API_BASE_URL}/users/${userId}/gender`,
      status: error.response?.status,
      message: error.message,
      validationErrors: error.response?.data?.errors
    });

    let errorMessage = error.response?.data?.message || error.message;
    
    if (error.response?.status === 400) {
      errorMessage = 'Invalid gender value provided';
    } else if (error.response?.status === 403) {
      errorMessage = 'You are not authorized to update this profile';
    }

    throw new Error(errorMessage);
  }
};

// Additional utility function to get auth data
export const getAuthData = async () => {
  try {
    const [userId, token] = await Promise.all([
      AsyncStorage.getItem('userId'),
      AsyncStorage.getItem('authToken')
    ]);
    return { userId, token };
  } catch (error) {
    console.error('Failed to get auth data:', error);
    throw new Error('Failed to retrieve authentication data');
  }
};