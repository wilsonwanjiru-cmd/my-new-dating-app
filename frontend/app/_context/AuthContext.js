// frontend/app/_context/AuthContext.js

import React, { createContext, useState, useEffect, useContext } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Alert } from "react-native";

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [subscriptionExpiresAt, setSubscriptionExpiresAt] = useState(null);

  // 🔍 Check if the subscription has expired
  const checkSubscriptionExpiry = () => {
    if (!subscriptionExpiresAt) return false;
    const now = new Date();
    const expiry = new Date(subscriptionExpiresAt);
    if (expiry < now) {
      setIsSubscribed(false);
      return false;
    }
    return true;
  };

  // 🔐 Logout function
  const logout = async () => {
    try {
      await AsyncStorage.clear();
      setUser(null);
      setToken(null);
      setIsSubscribed(false);
      setSubscriptionExpiresAt(null);
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // 📦 Load user from AsyncStorage on app start
  const loadUserFromStorage = async () => {
    try {
      const storedUser = await AsyncStorage.getItem("user");
      const storedToken = await AsyncStorage.getItem("token");

      if (storedUser && storedToken) {
        const parsedUser = JSON.parse(storedUser);

        setUser(parsedUser);
        setToken(storedToken);
        setIsSubscribed(parsedUser.isSubscribed);
        setSubscriptionExpiresAt(parsedUser.subscriptionExpiresAt);

        // Check if subscription expired
        const expiryDate = new Date(parsedUser.subscriptionExpiresAt);
        if (expiryDate < new Date()) {
          setIsSubscribed(false);
        }
      }
    } catch (error) {
      console.error("Error loading user from storage", error);
    }
  };

  useEffect(() => {
    loadUserFromStorage();
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        token,
        setToken,
        isSubscribed,
        setIsSubscribed,
        subscriptionExpiresAt,
        setSubscriptionExpiresAt,
        checkSubscriptionExpiry,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
