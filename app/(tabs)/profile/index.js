// app/(tabs)/profile/index.js
import { FlatList, StyleSheet, Text, View } from "react-native";
import React, { useState, useEffect } from "react";
import "core-js/stable/atob"; // Polyfill for atob (used by jwt-decode)
import { jwtDecode } from "jwt-decode"; // For decoding JWT tokens
import AsyncStorage from "@react-native-async-storage/async-storage"; // For storing and retrieving data locally
import axios from "axios"; // For making HTTP requests
import Profile from "../../../components/Profile"; // Custom Profile component

// Use the environment variable for the backend URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://api.rudadatingsite.singles/";

const Index = () => {
  const [userId, setUserId] = useState(""); // State to store the user ID
  const [user, setUser] = useState(null); // State to store the user details
  const [profiles, setProfiles] = useState([]); // State to store the list of profiles

  // Fetch the user ID from the JWT token stored in AsyncStorage
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = await AsyncStorage.getItem("auth"); // Retrieve the token
        if (token) {
          const decodedToken = jwtDecode(token); // Decode the token
          const userId = decodedToken.userId; // Extract the user ID
          setUserId(userId); // Set the user ID in state
        }
      } catch (error) {
        console.log("Error decoding token or fetching user ID:", error);
      }
    };

    fetchUser();
  }, []);

  // Fetch the user's details using the user ID
  const fetchUserDescription = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/users/${userId}/description`);
      console.log("User details response:", response);
      const user = response.data.user; // Extract user details from the response
      setUser(user); // Set the user details in state
    } catch (error) {
      console.log("Error fetching user description:", error);
    }
  };

  // Update the user's description
  const updateUserDescription = async (description) => {
    try {
      const response = await axios.post(
        `${API_BASE_URL}/api/users/${userId}/description`,
        { description }
      );
      console.log("Update description response:", response);
      if (response.status === 200) {
        setUser(response.data.user); // Update the user details in state
      }
    } catch (error) {
      console.log("Error updating user description:", error);
    }
  };

  // Fetch profiles based on the user's preferences
  const fetchProfiles = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/profiles`, {
        params: {
          userId: userId,
          gender: user?.gender,
          turnOns: user?.turnOns,
          lookingFor: user?.lookingFor,
        },
      });

      setProfiles(response.data.profiles); // Set the profiles in state
    } catch (error) {
      console.log("Error fetching profiles:", error);
    }
  };

  // Fetch user details when the user ID changes
  useEffect(() => {
    if (userId) {
      fetchUserDescription();
    }
  }, [userId]);

  // Fetch profiles when the user ID or user details change
  useEffect(() => {
    if (userId && user) {
      fetchProfiles();
    }
  }, [userId, user]);

  console.log("Profiles:", profiles);

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={profiles}
        keyExtractor={(item) => item.id} // Ensure each item has a unique key
        renderItem={({ item, index }) => (
          <Profile
            key={index}
            item={item}
            userId={userId}
            setProfiles={setProfiles}
            isEven={index % 2 === 0} // Alternate styling for even/odd items
          />
        )}
      />
    </View>
  );
};

export default Index;

const styles = StyleSheet.create({});