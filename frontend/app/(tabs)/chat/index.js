// app/(tabs)/chat/index.js
import { Pressable, StyleSheet, Text, View } from "react-native";
import React, { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import { MaterialIcons } from "@expo/vector-icons";
import { jwtDecode } from "jwt-decode";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import atob from "atob"; // ✅ Use the installed atob package
import UserChat from "../../../components/UserChat";

// Optional: if `atob` is not defined globally (just for safety on web builds)
if (typeof global.atob === "undefined") {
  global.atob = atob;
}

// Use the environment variable for the backend URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com/";

const ChatScreen = () => {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [matches, setMatches] = useState([]);

  // Fetch the user ID from AsyncStorage
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = await AsyncStorage.getItem("auth");
        const decodedToken = jwtDecode(token);
        const userId = decodedToken.userId;
        setUserId(userId);
      } catch (error) {
        console.log("Error fetching user ID", error);
      }
    };

    fetchUser();
  }, []);

  // Fetch received likes details
  const fetchReceivedLikesDetails = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/received-likes/${userId}/details`
      );
      setProfiles(response.data.receivedLikesDetails);
    } catch (error) {
      console.log("Error fetching received likes details", error);
    }
  };

  // Fetch user matches
  const fetchUserMatches = async () => {
    try {
      const response = await axios.get(
        `${API_BASE_URL}/api/users/${userId}/matches`
      );
      setMatches(response.data.matches);
    } catch (error) {
      console.log("Error fetching user matches", error);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchReceivedLikesDetails();
      fetchUserMatches();
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      if (userId) {
        fetchUserMatches();
      }
    }, [userId])
  );

  return (
    <View style={{ backgroundColor: "white", flex: 1, padding: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <Text style={{ fontSize: 20, fontWeight: "500" }}>CHATS</Text>
        <Ionicons name="chatbox-ellipses-outline" size={25} color="black" />
      </View>

      <Pressable
        onPress={() =>
          router.push({
            pathname: "/chat/select",
            params: {
              profiles: JSON.stringify(profiles),
              userId: userId,
            },
          })
        }
        style={{
          marginVertical: 12,
          flexDirection: "row",
          alignItems: "center",
        }}
      >
        <View
          style={{
            width: 50,
            height: 50,
            borderRadius: 25,
            backgroundColor: "#E0E0E0",
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Feather name="heart" size={24} color="black" />
        </View>
        <Text style={{ fontSize: 17, marginLeft: 10, flex: 1 }}>
          You have got {profiles?.length} likes
        </Text>
        <MaterialIcons name="keyboard-arrow-right" size={24} color="black" />
      </Pressable>

      <View>
        {matches?.map((item, index) => (
          <UserChat key={index} userId={userId} item={item} />
        ))}
      </View>
    </View>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({});
