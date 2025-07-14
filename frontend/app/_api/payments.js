// app/_api/payments.js
import axios from 'axios';
import { API_BASE_URL } from '../_config'; // ✅ updated path

export const makePayment = async (paymentData) => {
  try {
    const response = await axios.post(`${API_BASE_URL}/api/payments`, paymentData);
    return response.data;
  } catch (error) {
    console.error("Payment error:", error?.response?.data || error.message);
    throw error;
  }
};
