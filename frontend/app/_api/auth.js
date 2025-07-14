// frontend/app/_api/auth.js

import axios from "axios";
import Constants from "expo-constants";

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiUrl || "https://dating-apps.onrender.com";

// ✅ Login function (used in login screen)
export async function loginUser(email, password) {
  try {
    const response = await axios.post(
      `${API_BASE_URL}/api/auth/login`,
      {
        email,
        password,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "X-Connection-Source": "Mobile-App",
        },
        timeout: 15000,
      }
    );

    return {
      user: response.data.user,
      token: response.data.token,
    };
  } catch (error) {
    throw error; // handled in login.js
  }
}

// ✅ Re-check if a user is still subscribed
export async function checkSubscriptionStatus(userId) {
  try {
    const response = await axios.get(
      `${API_BASE_URL}/api/users/${userId}/subscription-status`
    );

    // Expected format: { isSubscribed: true, subscriptionExpiresAt: "2025-07-12T10:00:00Z" }
    return {
      isSubscribed: response.data.isSubscribed,
      subscriptionExpiresAt: response.data.subscriptionExpiresAt,
    };
  } catch (error) {
    console.error("Error checking subscription status:", error.message);
    return {
      isSubscribed: false,
      subscriptionExpiresAt: null,
    };
  }
}
