// app/_api/users.js
import axios from 'axios';
import { API_BASE_URL } from '../_config';

export const updateUserGender = async (userId, gender, token) => {
  try {
    const response = await axios.put(
      `${API_BASE_URL}/users/${userId}/gender`,
      { gender },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        }
      }
    );
    return response.data;
  } catch (error) {
    console.error('Gender update error:', {
      message: error.message,
      response: error.response?.data,
      config: error.config
    });
    throw new Error(error.response?.data?.message || 'Failed to update gender');
  }
};