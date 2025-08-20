// frontend/app/api/subscriptions.js
import axios from 'axios';
import { BASE_URL } from '../_config';
import { getAuthToken } from '../_context/AuthContext';

/**
 * Subscription Service for Ruda Dating App
 * Handles all subscription-related API calls
 */

// Cache subscription state to minimize API calls
let subscriptionCache = {
  lastUpdated: null,
  data: null
};

const CACHE_TTL = 5 * 60 * 1000; // 5 minutes cache

/**
 * Check and refresh subscription status
 * @returns {Promise<{
 *   isSubscribed: boolean,
 *   expiresAt: Date|null,
 *   freeUploadsUsed: number,
 *   freeUploadsLimit: number
 * }>}
 */
export const checkSubscriptionStatus = async () => {
  try {
    // Return cached data if still valid
    if (subscriptionCache.lastUpdated && 
        Date.now() - subscriptionCache.lastUpdated < CACHE_TTL) {
      return subscriptionCache.data;
    }

    const token = await getAuthToken();
    const response = await axios.get(`${BASE_URL}/api/subscription/status`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    const subscriptionData = {
      isSubscribed: response.data.isActive,
      expiresAt: response.data.expiresAt ? new Date(response.data.expiresAt) : null,
      freeUploadsUsed: response.data.freeUploadsUsed || 0,
      freeUploadsLimit: 7 // Hardcoded per business requirements
    };

    // Update cache
    subscriptionCache = {
      lastUpdated: Date.now(),
      data: subscriptionData
    };

    return subscriptionData;
  } catch (error) {
    console.error('Subscription check failed:', {
      status: error.response?.status,
      message: error.message,
      response: error.response?.data
    });
    
    // Return default values if API fails
    return {
      isSubscribed: false,
      expiresAt: null,
      freeUploadsUsed: 0,
      freeUploadsLimit: 7
    };
  }
};

/**
 * Activate premium subscription via M-Pesa
 * @param {string} phoneNumber - User's M-Pesa registered number
 * @returns {Promise<{
 *   success: boolean,
 *   message?: string,
 *   expiresAt?: Date
 * }>}
 */
export const activateSubscription = async (phoneNumber) => {
  try {
    const token = await getAuthToken();
    const response = await axios.post(
      `${BASE_URL}/api/subscription/activate`,
      { phoneNumber },
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    // Clear cache on successful activation
    subscriptionCache = {
      lastUpdated: Date.now(),
      data: {
        isSubscribed: true,
        expiresAt: new Date(response.data.expiresAt),
        freeUploadsUsed: response.data.freeUploadsUsed || 0,
        freeUploadsLimit: 7
      }
    };

    return {
      success: true,
      expiresAt: new Date(response.data.expiresAt),
      message: 'Subscription activated successfully'
    };
  } catch (error) {
    console.error('Subscription activation error:', {
      status: error.response?.status,
      message: error.message,
      response: error.response?.data
    });

    return {
      success: false,
      message: error.response?.data?.message || 'Failed to activate subscription'
    };
  }
};

/**
 * Get subscription payment history
 * @returns {Promise<Array<{
 *   amount: number,
 *   date: Date,
 *   mpesaCode: string,
 *   phoneNumber: string
 * }>>}
 */
export const getPaymentHistory = async () => {
  try {
    const token = await getAuthToken();
    const response = await axios.get(`${BASE_URL}/api/subscription/history`, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.payments.map(payment => ({
      ...payment,
      date: new Date(payment.date)
    }));
  } catch (error) {
    console.error('Failed to fetch payment history:', error);
    return [];
  }
};

/**
 * Check if user can upload more photos
 * @param {number} currentUploadCount
 * @returns {Promise<{
 *   canUpload: boolean,
 *   limitReached: boolean,
 *   requiresSubscription: boolean
 * }>}
 */
export const checkPhotoUploadEligibility = async (currentUploadCount) => {
  const status = await checkSubscriptionStatus();
  
  if (status.isSubscribed) {
    return {
      canUpload: true,
      limitReached: false,
      requiresSubscription: false
    };
  }

  const canUpload = currentUploadCount < status.freeUploadsLimit;
  return {
    canUpload,
    limitReached: !canUpload,
    requiresSubscription: !canUpload
  };
};

/**
 * Format subscription status for UI display
 * @param {Date|null} expiresAt 
 * @returns {string}
 */
export const formatSubscriptionStatus = (expiresAt) => {
  if (!expiresAt) return 'Inactive';
  
  const now = new Date();
  if (expiresAt <= now) return 'Expired';
  
  const hoursLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60));
  return `Active (${hoursLeft} hour${hoursLeft !== 1 ? 's' : ''} remaining)`;
};

// Clear cache when user logs out
export const clearSubscriptionCache = () => {
  subscriptionCache = {
    lastUpdated: null,
    data: null
  };
};