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
  TouchableOpacity
} from "react-native";
import React, { useLayoutEffect, useState, useEffect } from "react";
import { useNavigation } from "@react-navigation/native";
import { Ionicons, Feather, Entypo, MaterialCommunityIcons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { io } from "socket.io-client";
import axios from "axios";
import Constants from 'expo-constants';
import { useAuth } from "../../context/AuthContext";
import SubscribePrompt from "../../../components/SubscribePrompt";

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || "https://dating-app-3eba.onrender.com";

const ChatRoom = () => {
  const navigation = useNavigation();
  const [message, setMessage] = useState("");
  const params = useLocalSearchParams();
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState(null);
  const { user: currentUser, isSubscribed } = useAuth();

  // Initialize Socket.IO connection
  useEffect(() => {
    const newSocket = io(API_BASE_URL, {
      transports: ['websocket'],
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
    });

    newSocket.on("connect", () => {
      console.log("Connected to Socket.IO server");
      setSocket(newSocket);
    });

    newSocket.on("receiveMessage", (newMessage) => {
      setMessages(prev => [...prev, newMessage]);
    });

    newSocket.on("connect_error", (err) => {
      console.error("Socket connection error:", err);
    });

    return () => {
      newSocket.disconnect();
    };
  }, []);

  // Set up the navigation header
  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerLeft: () => (
        <View style={styles.headerLeft}>
          <Ionicons 
            name="arrow-back" 
            size={24} 
            color="black" 
            onPress={() => navigation.goBack()}
          />
          <View style={styles.profileInfo}>
            <Image
              style={styles.profileImage}
              source={{ uri: params?.image }}
            />
            <View>
              <Text style={styles.profileName}>{params?.name}</Text>
              {params?.isOnline && (
                <Text style={styles.onlineStatus}>Online</Text>
              )}
            </View>
          </View>
        </View>
      ),
      headerRight: () => (
        <View style={styles.headerRight}>
          <MaterialCommunityIcons
            name="dots-vertical"
            size={24}
            color="black"
          />
          {isSubscribed && (
            <Ionicons name="videocam-outline" size={24} color="black" />
          )}
        </View>
      ),
    });
  }, [isSubscribed]);

  // Fetch messages between the sender and receiver
  const fetchMessages = async () => {
    try {
      const response = await axios.get(`${API_BASE_URL}/api/messages`, {
        params: { 
          senderId: currentUser._id,
          receiverId: params?.receiverId 
        },
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('auth')}`
        }
      });
      setMessages(response.data);
    } catch (error) {
      console.error("Error fetching messages:", error.response?.data || error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMessages();
  }, []);

  // Send a message
  const sendMessage = async () => {
    if (!message.trim()) return;
    
    try {
      const newMessage = {
        senderId: currentUser._id,
        receiverId: params.receiverId,
        message,
        timestamp: new Date(),
        requiresSubscription: true
      };

      if (socket) {
        socket.emit("sendMessage", newMessage);
      }

      // Optimistic update
      setMessages(prev => [...prev, newMessage]);
      setMessage("");

      // Send to backend
      await axios.post(`${API_BASE_URL}/api/messages`, newMessage, {
        headers: {
          'Authorization': `Bearer ${await AsyncStorage.getItem('auth')}`
        }
      });

      // Notify recipient if they haven't paid
      if (!params.isSubscribed) {
        await axios.post(`${API_BASE_URL}/api/notifications`, {
          recipientId: params.receiverId,
          type: 'new_message',
          message: `${currentUser.name} sent you a message`,
          data: { 
            senderId: currentUser._id,
            requiresSubscription: true
          }
        }, {
          headers: {
            'Authorization': `Bearer ${await AsyncStorage.getItem('auth')}`
          }
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      // Rollback optimistic update
      setMessages(prev => prev.slice(0, -1));
    }
  };

  // Format the timestamp
  const formatTime = (time) => {
    return new Date(time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

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
        ref={ref => {
          this.scrollView = ref;
        }}
        onContentSizeChange={() => this.scrollView.scrollToEnd({ animated: true })}
      >
        {messages.map((item, index) => (
          <View
            key={index}
            style={[
              styles.messageBubble,
              item.senderId === currentUser._id 
                ? styles.sentMessage 
                : styles.receivedMessage
            ]}
          >
            <Text style={styles.messageText}>{item.message}</Text>
            <Text style={styles.messageTime}>
              {formatTime(item.timestamp)}
              {item.senderId === currentUser._id && (
                <Ionicons 
                  name={item.read ? "checkmark-done" : "checkmark"} 
                  size={12} 
                  color={item.read ? "#4CAF50" : "#999"} 
                  style={{ marginLeft: 4 }}
                />
              )}
            </Text>
          </View>
        ))}
      </ScrollView>

      {!isSubscribed ? (
        <SubscribePrompt 
          onSubscribe={() => navigation.navigate('Subscribe')}
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
            style={styles.input}
            placeholder="Type your message..."
            placeholderTextColor="#999"
            multiline
          />
          
          <TouchableOpacity style={styles.mediaButton}>
            <Feather name="mic" size={24} color="#666" />
          </TouchableOpacity>
          
          <TouchableOpacity 
            onPress={sendMessage}
            style={styles.sendButton}
            disabled={!message.trim()}
          >
            <Ionicons 
              name="send" 
              size={20} 
              color={message.trim() ? "white" : "#ccc"} 
            />
          </TouchableOpacity>
        </View>
      )}
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  profileInfo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    resizeMode: "cover",
  },
  profileName: {
    fontSize: 16,
    fontWeight: "bold",
  },
  onlineStatus: {
    fontSize: 12,
    color: "#4CAF50",
  },
  headerRight: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
  },
  messagesContainer: {
    padding: 16,
    paddingBottom: 80,
  },
  messageBubble: {
    maxWidth: '75%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  sentMessage: {
    alignSelf: 'flex-end',
    backgroundColor: '#F08080',
    borderBottomRightRadius: 4,
  },
  receivedMessage: {
    alignSelf: 'flex-start',
    backgroundColor: '#DB7093',
    borderBottomLeftRadius: 4,
  },
  messageText: {
    fontSize: 16,
    color: 'white',
  },
  messageTime: {
    fontSize: 10,
    color: 'rgba(255,255,255,0.7)',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    paddingBottom: 24,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  input: {
    flex: 1,
    minHeight: 40,
    maxHeight: 120,
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f0f0f0',
    borderRadius: 20,
    fontSize: 16,
  },
  mediaButton: {
    marginHorizontal: 8,
  },
  sendButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F08080',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 8,
  },
});

export default ChatRoom;