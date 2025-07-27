import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { router } from 'expo-router';

// Base URL from environment or fallback
const API_BASE_URL =
  Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL ||
  "https://dating-app-3eba.onrender.com";

console.log("🔗 API Base URL:", API_BASE_URL);

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
  headers: {
    "Content-Type": "application/json",
  },
});

// Request Interceptor
api.interceptors.request.use(
  async (config) => {
    try {
      const token = await AsyncStorage.getItem("auth");
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      } else {
        console.warn("⚠️ No auth token found.");
      }
    } catch (err) {
      console.error("❌ Failed to attach token:", err);
    }
    return config;
  },
  (error) => {
    console.error("❌ Request Error:", error);
    return Promise.reject(error);
  }
);

// Response Interceptor
api.interceptors.response.use(
  (response) => {
    console.log(`✅ Response [${response.status}] from ${response.config.url}`);
    return response;
  },
  async (error) => {
    if (error.response) {
      const { status, data, config } = error.response;
      console.error(`❌ Error [${status}] from ${config?.url}`);
      console.error("🔍 Details:", JSON.stringify(data, null, 2));

      if (
        (status === 401 || status === 403) &&
        data?.message === "Email not verified"
      ) {
        console.warn("📧 Email not verified. Redirecting to /verify.");

        if (data?.userId) {
          router.replace({
            pathname: "/(authenticate)/verify",
            params: { userId: data.userId },
          });
        } else {
          console.error("❗ Missing userId in error response.");
        }
      } else if (status === 401) {
        console.warn("⚠️ Unauthorized. Logging out...");
        await AsyncStorage.removeItem("auth");
        router.replace("/(authenticate)/login");
      } else if (status === 403) {
        console.warn("⛔ Forbidden. You don’t have permission to access this.");
      }
    } else if (error.request) {
      console.error("📡 No response received:", error.request);
    } else {
      console.error("⚠️ Request setup error:", error.message);
    }

    return Promise.reject(error);
  }
);

// Utility: Update profile image
export const updateProfileImage = async (userId, description) => {
  try {
    console.log(`📤 PUT /api/users/${userId}/profile-images`, { description });
    const response = await api.put(`/api/users/${userId}/profile-images`, {
      description,
    });
    return response.data;
  } catch (error) {
    const message = error.response?.data || error.message;
    console.error("❌ Failed to update profile image:", message);
    throw error;
  }
};

// Utility: Resend verification email
export const resendVerificationEmail = async (userId) => {
  try {
    console.log(`📨 POST /api/resend-verification for user ${userId}`);
    const response = await api.post(`/api/resend-verification`, { userId });
    return response.data;
  } catch (error) {
    console.error(
      "❌ Failed to resend verification email:",
      error.response?.data || error.message
    );
    throw error;
  }
};

export default api;