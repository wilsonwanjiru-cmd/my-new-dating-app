import { 
  StyleSheet, 
  Text, 
  View, 
  Pressable, 
  Image, 
  Alert,
  ActivityIndicator
} from "react-native";
import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import axios from "axios";
import { MaterialIcons } from "@expo/vector-icons";
import { useSocket } from "../src/_context/SocketContext";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Use the environment variable for the backend URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com";

const UserChat = ({ item, userId, isOnline, onError }) => {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [lastMessage, setLastMessage] = useState(null);
  const { onlineUsers } = useSocket();

  // Get online status (if not passed as prop)
  const userIsOnline = isOnline !== undefined ? isOnline : onlineUsers.includes(item?._id);

  // Fetch messages between the current user and the selected user
  const fetchMessages = async () => {
    try {
      setLoading(true);
      const token = await AsyncStorage.getItem("authToken");
      
      // Only fetch messages if chat already exists
      if (item?.chatId) {
        const response = await axios.get(`${API_BASE_URL}/api/chats/${item.chatId}/messages`, {
          headers: { Authorization: `Bearer ${token}` },
          params: {
            limit: 1, // Only get the last message
            sort: "-createdAt" // Newest first
          }
        });

        if (response.data.length > 0) {
          setLastMessage(response.data[0]);
        }
      }
    } catch (error) {
      console.error("Error fetching messages:", error);
      if (error.response?.status === 403) {
        handleSubscriptionError(error);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, [item?.chatId]); // Only refetch when chatId changes

  const handleSubscriptionError = (error) => {
    // Redirect to subscription screen
    router.push("/subscribe");
    
    // Also call parent error handler if provided
    if (onError) {
      onError(error);
    } else {
      Alert.alert(
        "Subscription Required", 
        "You need a premium subscription to start chatting"
      );
    }
  };

  const handlePress = async () => {
    try {
      const token = await AsyncStorage.getItem("authToken");
      
      // If no existing chat, try to initiate one
      if (!item.chatId) {
        const response = await axios.post(
          `${API_BASE_URL}/api/chats`,
          { recipientId: item._id },
          { headers: { Authorization: `Bearer ${token}` } }
        );
        
        item.chatId = response.data.chat._id;
      }
      
      router.push({
        pathname: "/chat/chatroom",
        params: {
          chatId: item.chatId,
          image: item?.profileImages[0],
          name: item?.name,
          receiverId: item?._id,
          senderId: userId,
          isOnline: userIsOnline
        }
      });
    } catch (error) {
      console.error("Chat initiation error:", error);
      
      // Handle subscription errors
      if (error.response?.status === 403) {
        handleSubscriptionError(error);
      } 
      // Handle other errors
      else if (error.response?.status === 404) {
        Alert.alert("User Not Found", "This user is no longer available");
      } else {
        Alert.alert(
          "Error", 
          error.response?.data?.message || "Failed to start chat"
        );
      }
    }
  };

  const formatTime = (timestamp) => {
    if (!timestamp) return "";
    
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = Math.abs(now - date) / 36e5;
    
    if (diffHours < 24) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else {
      return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      style={styles.container}
    >
      <View style={styles.avatarContainer}>
        <Image
          style={styles.avatar}
          source={{ uri: item?.profileImages[0] || "https://via.placeholder.com/60" }}
        />
        {userIsOnline && <View style={styles.greenDot} />}
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.name}>{item?.name}</Text>
          {lastMessage && (
            <Text style={styles.time}>
              {formatTime(lastMessage?.timestamp)}
            </Text>
          )}
        </View>
        
        {loading ? (
          <ActivityIndicator size="small" color="#888" />
        ) : lastMessage ? (
          <Text style={styles.message} numberOfLines={1}>
            {lastMessage.sender === userId ? "You: " : ""}
            {lastMessage.content}
          </Text>
        ) : (
          <Text style={styles.message}>
            {item.chatId ? "Start chatting" : "Tap to start conversation"}
          </Text>
        )}
      </View>
      
      <MaterialIcons name="keyboard-arrow-right" size={24} color="#888" />
    </Pressable>
  );
};

export default UserChat;

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  avatarContainer: {
    position: 'relative',
    marginRight: 12,
  },
  avatar: {
    width: 60, 
    height: 60, 
    borderRadius: 30,
    backgroundColor: '#f0f0f0',
  },
  greenDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: 'green',
    borderWidth: 2,
    borderColor: 'white',
  },
  content: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  name: {
    fontWeight: "600",
    fontSize: 16,
    color: "#333",
  },
  time: {
    fontSize: 12,
    color: '#888',
  },
  message: {
    fontSize: 14,
    color: '#666',
    marginTop: 2,
  },
});