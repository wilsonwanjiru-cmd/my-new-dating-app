import axios from "axios";
import Constants from "expo-constants";
import AsyncStorage from "@react-native-async-storage/async-storage";

// Fetch API base URL from environment variables
const API_BASE_URL = Constants.expoConfig?.extra?.EXPO_PUBLIC_API_BASE_URL || "https://dating-apps.onrender.com";

console.log("EXPO_PUBLIC_API_BASE_URL:", API_BASE_URL); // Debug log to verify API URL

// Create an Axios instance with the base URL
const api = axios.create({
  baseURL: API_BASE_URL, // Set base URL dynamically
  timeout: 10000, // Set a timeout for requests (10 seconds)
  headers: {
    "Content-Type": "application/json",
  },
});

// Add request interceptor to attach auth token
api.interceptors.request.use(
  async (config) => {
    try {
      console.log(`Request: ${config.method.toUpperCase()} ${config.baseURL}${config.url}`);

      // Retrieve the auth token from AsyncStorage
      const token = await AsyncStorage.getItem("auth");

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
      }
    } catch (error) {
      console.error("Error retrieving auth token:", error);
    }

    return config;
  },
  (error) => {
    console.error("Request Error:", error);
    return Promise.reject(error);
  }
);

// Add response interceptor to handle errors and log responses
api.interceptors.response.use(
  (response) => {
    console.log(`Response: ${response.status} ${response.config.url}`, response.data);
    return response;
  },
  async (error) => {
    console.error("Response Error:", error);

    if (error.response) {
      console.error("Error Data:", error.response.data);
      console.error("Error Status:", error.response.status);

      if (error.response.status === 401) {
        console.error("Unauthorized: Logging out...");
        await AsyncStorage.removeItem("auth");
      }
    } else if (error.request) {
      console.error("No Response Received:", error.request);
    } else {
      console.error("Request Setup Error:", error.message);
    }

    return Promise.reject(error);
  }
);

// Function to update profile images
export const updateProfileImage = async (userId, description) => {
  try {
    console.log(`Sending request to: ${API_BASE_URL}/api/users/${userId}/profile-images`);
    console.log("Payload:", { description });

    const response = await api.put(`/api/users/${userId}/profile-images`, { description });

    console.log("Response:", response.data);
    return response.data;
  } catch (error) {
    console.error("Error updating profile image:", error.response?.data || error.message);
    throw error;
  }
};

export default api;
