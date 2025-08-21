import {
  StyleSheet,
  Text,
  View,
  Image,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  TouchableOpacity,
  Platform
} from "react-native";
import React, { useLayoutEffect, useState, useEffect, useRef } from "react";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons, Feather, Entypo, MaterialCommunityIcons } from "@expo/vector-icons";
import { io } from "socket.io-client";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { useAuth } from "../../../src/_context/AuthContext";
import SubscribePrompt from "../../../components/SubscribePrompt";

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || "https://dating-app-3eba.onrender.com";

const ChatRoom = () => {
  const router = useRouter();
  const scrollRef = useRef(null);
  const [message, setMessage] = useState("");
  const params = useLocalSearchParams();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const { user: currentUser, isSubscribed, subscriptionExpiresAt } = useAuth();

  // Check subscription expiry
  const hasValidSubscription = () => {
    if (!isSubscribed || !subscriptionExpiresAt) return false;
    return new Date(subscriptionExpiresAt) > new Date();
  };

  const canSendMessages = hasValidSubscription();

  // Initialize socket
  useEffect(() => {
    const newSocket = io(API_BASE_URL, {
      transports: ["websocket"],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on("connect", () => {
      console.log("Connected to socket.io");
      setSocket(newSocket);
    });

    newSocket.on("receiveMessage", (newMessage) => {
      setMessages((prev) => [...prev, newMessage]);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Fetch messages
  useEffect(() => {
    const fetchMessages = async () => {
      try {
        const token = await AsyncStorage.getItem("authToken");
        const response = await axios.get(`${API_BASE_URL}/api/messages`, {
          params: {
            senderId: currentUser._id,
            receiverId: params?.receiverId,
          },
          headers: { Authorization: `Bearer ${token}` },
        });
        setMessages(response.data);
      } catch (error) {
        console.error("Error loading messages:", error);
      } finally {
        setLoading(false);
      }
    };
    fetchMessages();
  }, []);

  // Scroll to bottom
  useEffect(() => {
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [messages]);

  // Navigation header
  useLayoutEffect(() => {
    // Set header options for Expo Router
    router.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <View style={styles.headerLeft}>
          <Ionicons
            name="arrow-back"
            size={24}
            color="black"
            onPress={() => router.back()}
          />
          <View style={styles.profileInfo}>
            <Image source={{ uri: params?.image }} style={styles.profileImage} />
            <View>
              <Text style={styles.profileName}>{params?.name}</Text>
              {params?.isOnline && <Text style={styles.onlineStatus}>Online</Text>}
            </View>
          </View>
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerRight}>
          <MaterialCommunityIcons name="dots-vertical" size={24} color="black" />
          {canSendMessages && <Ionicons name="videocam-outline" size={24} color="black" />}
        </View>
      ),
    });
  }, [canSendMessages]);

  const sendMessage = async () => {
    if (!message.trim()) return;

    if (!canSendMessages) {
      return;
    }

    const newMessage = {
      senderId: currentUser._id,
      receiverId: params.receiverId,
      message,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, newMessage]);
    setMessage("");

    try {
      if (socket) {
        socket.emit("sendMessage", newMessage);
      }

      const token = await AsyncStorage.getItem("authToken");
      await axios.post(`${API_BASE_URL}/api/messages`, newMessage, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      // Send notification to unsubscribed users (optional)
      if (!params.isSubscribed) {
        await axios.post(`${API_BASE_URL}/api/notifications`, {
          recipientId: params.receiverId,
          type: "new_message",
          message: `${currentUser.name} sent you a message`,
        });
      }
    } catch (err) {
      console.error("Failed to send:", err);
      setMessages((prev) => prev.slice(0, -1)); // rollback
    }
  };

  const formatTime = (time) =>
    new Date(time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={90}
    >
      <ScrollView
        contentContainerStyle={styles.messagesContainer}
        ref={scrollRef}
        onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}
      >
        {messages.map((item, index) => (
          <View
            key={index}
            style={[
              styles.messageBubble,
              item.senderId === currentUser._id ? styles.sentMessage : styles.receivedMessage,
            ]}
          >
            <Text style={styles.messageText}>{item.message}</Text>
            <Text style={styles.messageTime}>{formatTime(item.timestamp)}</Text>
          </View>
        ))}
      </ScrollView>

      {!canSendMessages ? (
        <SubscribePrompt
          onSubscribe={() => router.push("/subscribe")}
          message="Subscribe to send messages"
        />
      ) : (
        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.mediaButton}>
            <Entypo name="camera" size={24} color="#666" />
          </TouchableOpacity>
          <TextInput
            value={message}
            onChangeText={setMessage}
            placeholder="Type a message..."
            style={styles.input}
            multiline
          />
          <TouchableOpacity
            onPress={sendMessage}
            style={styles.sendButton}
            disabled={!message.trim()}
          >
            <Ionicons name="send" size={20} color="white" />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f5f5f5" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
  profileInfo: { flexDirection: "row", alignItems: "center", gap: 8 },
  profileImage: { width: 36, height: 36, borderRadius: 18 },
  profileName: { fontSize: 16, fontWeight: "bold" },
  onlineStatus: { fontSize: 12, color: "#4CAF50" },
  headerRight: { flexDirection: "row", alignItems: "center", gap: 15 },
  messagesContainer: { padding: 16, paddingBottom: 80 },
  messageBubble: {
    maxWidth: "75%",
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  sentMessage: {
    alignSelf: "flex-end",
    backgroundColor: "#F08080",
    borderBottomRightRadius: 4,
  },
  receivedMessage: {
    alignSelf: "flex-start",
    backgroundColor: "#DB7093",
    borderBottomLeftRadius: 4,
  },
  messageText: { fontSize: 16, color: "white" },
  messageTime: {
    fontSize: 10,
    color: "rgba(255,255,255,0.7)",
    marginTop: 4,
    alignSelf: "flex-end",
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    paddingBottom: 24,
    backgroundColor: "white",
    borderTopWidth: 1,
    borderTopColor: "#eee",
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f0f0f0",
    borderRadius: 20,
    fontSize: 16,
  },
  mediaButton: { marginHorizontal: 8 },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#F08080",
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
});

export default ChatRoom;
