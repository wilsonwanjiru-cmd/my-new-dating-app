import { Pressable, StyleSheet, Text, View, ActivityIndicator, Alert } from "react-native";
import React, { useState, useEffect, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { Feather } from "@expo/vector-icons";
import { MaterialIcons } from "@expo/vector-icons";
import { jwtDecode } from "jwt-decode";
import AsyncStorage from "@react-native-async-storage/async-storage";
import axios from "axios";
import { useRouter, useFocusEffect } from "expo-router";
import { useSocket } from '../../../src/_context/SocketContext'; // Fixed import path
import UserChat from "../../../components/UserChat";

// Use the environment variable for the backend URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com";

const ChatScreen = () => {
  const router = useRouter();
  const [userId, setUserId] = useState("");
  const [profiles, setProfiles] = useState([]);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { onlineUsers } = useSocket(); // Added online status tracking

  // Fetch the user ID from AsyncStorage
  useEffect(() => {
    const fetchUser = async () => {
      try {
        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          router.replace("/(authenticate)/login");
          return;
        }
        
        const decodedToken = jwtDecode(token);
        const userId = decodedToken.userId;
        setUserId(userId);
      } catch (error) {
        console.log("Error fetching user ID", error);
        setError("Failed to load user information");
      }
    };

    fetchUser();
  }, []);

  // Fetch received likes details
  const fetchReceivedLikesDetails = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      
      const response = await axios.get(
        `${API_BASE_URL}/api/received-likes/${userId}/details`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      setProfiles(response.data.receivedLikesDetails || []);
    } catch (error) {
      console.log("Error fetching received likes details", error);
      setError("Failed to load likes");
    }
  };

  // Fetch user matches with last message and online status
  const fetchUserMatches = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("authToken");
      if (!token) return;
      
      const response = await axios.get(
        `${API_BASE_URL}/api/chats`,
        {
          headers: { Authorization: `Bearer ${token}` }
        }
      );
      
      // Add online status to each match
      const matchesWithStatus = response.data.map(match => ({
        ...match,
        isOnline: onlineUsers.includes(match.user._id)
      }));
      
      setMatches(matchesWithStatus);
    } catch (error) {
      console.log("Error fetching user matches", error);
      setError("Failed to load chats");
      
      if (error.response?.status === 401) {
        router.replace("/(authenticate)/login");
      }
    } finally {
      setLoading(false);
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
    }, [userId, onlineUsers]) // Re-fetch when online users change
  );

  // Handle subscription required error when starting chat
  const handleChatInitiationError = (error) => {
    if (error.response?.status === 403) {
      router.push("/subscribe");
    } else {
      Alert.alert("Error", error.response?.data?.message || "Failed to start chat");
    }
  };

  return (
    <View style={{ backgroundColor: "white", flex: 1, padding: 10 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 15,
        }}
      >
        <Text style={{ fontSize: 24, fontWeight: "bold" }}>Chats</Text>
        <Ionicons name="chatbox-ellipses-outline" size={28} color="#FF4081" />
      </View>

      {loading && !error && (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color="#5D3FD3" />
        </View>
      )}

      {error && !loading && (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
          <Pressable
            style={styles.retryButton}
            onPress={() => {
              setError(null);
              fetchUserMatches();
            }}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </Pressable>
        </View>
      )}

      {!loading && !error && (
        <>
          <Pressable
            onPress={() => {
              if (profiles.length > 0) {
                router.push({
                  pathname: "/(tabs)/chat/select",
                  params: {
                    profiles: JSON.stringify(profiles),
                    userId: userId,
                  },
                });
              } else {
                Alert.alert("No Likes", "You don't have any likes yet");
              }
            }}
            style={styles.likesContainer}
          >
            <View style={styles.likesIcon}>
              <Feather name="heart" size={24} color="#DE3163" />
            </View>
            <Text style={styles.likesText}>
              You have {profiles?.length || 0} new likes
            </Text>
            <MaterialIcons name="keyboard-arrow-right" size={24} color="#666" />
          </Pressable>

          <Text style={styles.sectionTitle}>Your Matches</Text>
          
          {matches.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No matches yet</Text>
              <Text style={styles.emptySubtext}>
                Like more profiles to start chatting
              </Text>
            </View>
          ) : (
            <View style={styles.chatList}>
              {matches.map((item, index) => (
                <UserChat 
                  key={index} 
                  userId={userId} 
                  item={item}
                  isOnline={item.isOnline} // Pass online status
                  onError={handleChatInitiationError}
                />
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
};

export default ChatScreen;

const styles = StyleSheet.create({
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryButton: {
    padding: 12,
    backgroundColor: '#5D3FD3',
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  likesContainer: {
    marginVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: '#F8F6FF',
    padding: 15,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  likesIcon: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: '#FFEBEE',
    justifyContent: "center",
    alignItems: "center",
  },
  likesText: {
    fontSize: 17,
    marginLeft: 10,
    flex: 1,
    fontWeight: '500',
    color: '#333',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 20,
    marginBottom: 10,
    color: '#444',
  },
  chatList: {
    marginTop: 10,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    backgroundColor: '#F9F9F9',
    borderRadius: 12,
    marginTop: 20,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#666',
    marginBottom: 8,
  },
  emptySubtext: {
    fontSize: 15,
    color: '#888',
    textAlign: 'center',
  },
});