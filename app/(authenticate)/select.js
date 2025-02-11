import { StyleSheet, Text, View, Pressable, Image, Alert } from "react-native";
import React, { useState, useEffect } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage"; // For storing and retrieving data locally
import "core-js/stable/atob"; // Polyfill for atob (used by jwt-decode)
import { jwtDecode } from "jwt-decode"; // For decoding JWT tokens
import axios from "axios"; // For making HTTP requests
import { useRouter } from "expo-router"; // For navigation

const Select = () => {
  const router = useRouter();
  const [option, setOption] = useState(""); // State to store the selected gender option
  const [userId, setUserId] = useState(""); // State to store the user ID

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

  // Update the user's gender
  const updateUserGender = async () => {
    try {
      const response = await axios.put(
        `http://localhost:5000/api/users/${userId}/gender`,
        { gender: option }
      );

      console.log("Update gender response:", response.data);

      if (response.status === 200) {
        Alert.alert("Success", "Gender updated successfully!");
        router.replace("(tabs)/bio"); // Navigate to the bio screen
      }
    } catch (error) {
      console.log("Error updating gender:", error);
      Alert.alert("Error", "Failed to update gender.");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: "white", padding: 12 }}>
      {/* Male Option */}
      <Pressable
        onPress={() => setOption("male")}
        style={{
          backgroundColor: "#F0F0F0",
          padding: 12,
          justifyContent: "space-between",
          flexDirection: "row",
          alignItems: "center",
          marginTop: 25,
          borderRadius: 5,
          borderColor: option === "male" ? "#D0D0D0" : "transparent",
          borderWidth: option === "male" ? 1 : 0,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "500" }}>I am a Man</Text>
        <Image
          style={{ width: 50, height: 50 }}
          source={{
            uri: "https://cdn-icons-png.flaticon.com/128/12442/12442425.png",
          }}
        />
      </Pressable>

      {/* Female Option */}
      <Pressable
        onPress={() => setOption("female")}
        style={{
          backgroundColor: "#F0F0F0",
          padding: 12,
          justifyContent: "space-between",
          flexDirection: "row",
          alignItems: "center",
          marginTop: 25,
          borderRadius: 5,
          borderColor: option === "female" ? "#D0D0D0" : "transparent",
          borderWidth: option === "female" ? 1 : 0,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "500" }}>I am a Woman</Text>
        <Image
          style={{ width: 50, height: 50 }}
          source={{
            uri: "https://cdn-icons-png.flaticon.com/128/9844/9844179.png",
          }}
        />
      </Pressable>

      {/* Non-Binary Option */}
      <Pressable
        onPress={() => setOption("nonbinary")}
        style={{
          backgroundColor: "#F0F0F0",
          padding: 12,
          justifyContent: "space-between",
          flexDirection: "row",
          alignItems: "center",
          marginTop: 25,
          borderRadius: 5,
          borderColor: option === "nonbinary" ? "#D0D0D0" : "transparent",
          borderWidth: option === "nonbinary" ? 1 : 0,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "500" }}>I am Non-Binary</Text>
        <Image
          style={{ width: 50, height: 50 }}
          source={{
            uri: "https://cdn-icons-png.flaticon.com/128/12442/12442425.png",
          }}
        />
      </Pressable>

      {/* Done Button */}
      {option && (
        <Pressable
          onPress={updateUserGender}
          style={{
            marginTop: 25,
            backgroundColor: "black",
            padding: 12,
            borderRadius: 4,
          }}
        >
          <Text
            style={{ textAlign: "center", color: "white", fontWeight: "600" }}
          >
            Done
          </Text>
        </Pressable>
      )}
    </View>
  );
};

export default Select;

const styles = StyleSheet.create({});