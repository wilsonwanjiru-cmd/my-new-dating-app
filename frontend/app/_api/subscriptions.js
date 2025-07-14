// frontend/app/api/subscriptions.js
import axios from 'axios';
import { BASE_URL } from '../_config';

export async function checkSubscriptionStatus(userId) {
  try {
    const response = await axios.get(`${BASE_URL}/api/subscription/status/${userId}`);
    return response.data.isSubscribed; // Adjust based on actual backend response
  } catch (error) {
    console.error('Error checking subscription:', error.message);
    return false;
  }
}
