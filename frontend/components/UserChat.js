import { StyleSheet, Text, View, Pressable, Image } from "react-native";
import React, { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import axios from "axios";

// Use the environment variable for the backend URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com";

const UserChat = ({ item, userId }) => {
  const router = useRouter();
  const [messages, setMessages] = useState([]);

  // Get the last message from the messages array
  const getLastMessage = () => {
    const n = messages.length;
    return messages[n - 1];
  };

  const lastMessage = getLastMessage();

  // Fetch messages when the component mounts
  useEffect(() => {
    fetchMessages();
  }, []);

  // Fetch messages between the current user and the selected user
  const fetchMessages = async () => {
    try {
      const senderId = userId;
      const receiverId = item?._id;

      // Fetch messages from the backend
      const response = await axios.get(`${API_BASE_URL}/api/messages`, {
        params: { senderId, receiverId },
      });

      // Update the messages state with the fetched messages
      setMessages(response.data);
    } catch (error) {
      console.error("Error fetching messages:", error);
    }
  };

  return (
    <Pressable
      onPress={() =>
        router.push({
          pathname: "/chat/chatroom",
          params: {
            image: item?.profileImages[0],
            name: item?.name,
            receiverId: item?._id,
            senderId: userId,
          },
        })
      }
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        marginVertical: 12,
      }}
    >
      <View>
        <Image
          style={{ width: 60, height: 60, borderRadius: 35 }}
          source={{ uri: item?.profileImages[0] }}
        />
      </View>

      <View>
        <Text
          style={{
            fontWeight: "500",
            color: "#DE3163",
            fontSize: 15,
            fontFamily: "Kailasa",
          }}
        >
          {item?.name}
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontWeight: "500",
            marginTop: 6,
            fontFamily: "Lao Sangam MN",
          }}
        >
          {lastMessage ? lastMessage?.message : `Start Chat with ${item?.name}`}
        </Text>
      </View>
    </Pressable>
  );
};

export default UserChat;

const styles = StyleSheet.create({});