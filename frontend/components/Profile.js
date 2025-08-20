import {
  ScrollView,
  StyleSheet,
  Text,
  View,
  Image,
  Pressable,
} from "react-native";
import React, { useState } from "react";
import { Entypo } from "@expo/vector-icons";
import { AntDesign } from "@expo/vector-icons";
import { FontAwesome } from "@expo/vector-icons";
import axios from "axios";
import * as Animatable from 'react-native-animatable';
import { useSocket } from '../app/_context/SocketContext'; // Added SocketContext

// Use the environment variable for the backend URL
const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com";

const Profile = ({ item, isEven, userId, setProfiles }) => {
  const [liked, setLiked] = useState(false);
  const [selected, setSelected] = useState(false);
  
  // Added online status tracking
  const { onlineUsers } = useSocket();
  const isOnline = onlineUsers.includes(item?._id); // Check if user is online

  // Function to handle sending a like
  const handleLike = async (selectedUserId) => {
    try {
      setLiked(true);
      await axios.post(`${API_BASE_URL}/api/match/send-like`, {
        currentUserId: userId,
        selectedUserId: selectedUserId,
      });

      // Remove profile after short delay
      setTimeout(() => {
        setProfiles((prevProfiles) =>
          prevProfiles.filter((profile) => profile._id !== selectedUserId)
        );
        setLiked(false);
      }, 200);
    } catch (error) {
      console.log("Error liking profile:", error);
    }
  };

  // Function to handle sending a like (alternative)
  const handleLikeOther = async (selectedUserId) => {
    try {
      setSelected(true);
      await axios.post(`${API_BASE_URL}/api/match/send-like`, {
        currentUserId: userId,
        selectedUserId: selectedUserId,
      });

      // Remove profile after short delay
      setTimeout(() => {
        setProfiles((prevProfiles) =>
          prevProfiles.filter((profile) => profile._id !== selectedUserId)
        );
        setSelected(false);
      }, 200);
    } catch (error) {
      console.log("Error liking profile:", error);
    }
  };

  // Render the profile component
  if (isEven) {
    return (
      <View style={{ padding: 12, backgroundColor: "#F0F8FF" }}>
        <ScrollView showsHorizontalScrollIndicator={false} horizontal>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 50 }}>
            <View>
              <View style={styles.nameContainer}>
                <Text style={{ fontSize: 17, fontWeight: "600" }}>
                  {item?.name}
                </Text>
                {isOnline && <View style={styles.greenDot} />}
              </View>
              <Text
                style={{
                  width: 200,
                  marginTop: 15,
                  fontSize: 18,
                  lineHeight: 24,
                  fontFamily: "Optima",
                  marginBottom: 8,
                }}
              >
                {item?.description?.length > 160
                  ? item?.description
                  : item?.description.substr(0, 160)}
              </Text>
            </View>

            {item?.profileImages?.slice(0, 1).map((item, index) => (
              <View style={styles.imageContainer} key={index}>
                <Image
                  style={{
                    width: 280,
                    height: 280,
                    resizeMode: "cover",
                    borderRadius: 5,
                  }}
                  source={{ uri: item }}
                />
                {isOnline && <View style={styles.greenDotImage} />}
              </View>
            ))}
          </View>
        </ScrollView>

        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 12,
            }}
          >
            <Entypo name="dots-three-vertical" size={26} color="black" />
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 20 }}
            >
              <Pressable
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: "#E0E0E0",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <FontAwesome name="diamond" size={27} color="#DE3163" />
              </Pressable>

              {liked ? (
                <Pressable
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: "#E0E0E0",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Animatable.View
                    animation="swing"
                    easing={"ease-in-out-circ"}
                    iterationCount={1}
                  >
                    <AntDesign name="heart" size={27} color="red" />
                  </Animatable.View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => handleLike(item?._id)}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: "#E0E0E0",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <AntDesign name="hearto" size={27} color="#FF033E" />
                </Pressable>
              )}
            </View>
          </View>
        </View>

        <View style={{ marginVertical: 15 }} />
      </View>
    );
  } else {
    return (
      <View style={{ padding: 12, backgroundColor: "#FFFFFF" }}>
        <ScrollView showsHorizontalScrollIndicator={false} horizontal>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 50 }}>
            {item?.profileImages?.slice(0, 1).map((item, index) => (
              <View style={styles.imageContainer} key={index}>
                <Image
                  style={{
                    width: 200,
                    height: 280,
                    resizeMode: "cover",
                    borderRadius: 5,
                  }}
                  source={{ uri: item }}
                />
                {isOnline && <View style={styles.greenDotImage} />}
              </View>
            ))}
            <View>
              <View style={styles.nameContainer}>
                <Text style={{ fontSize: 17, fontWeight: "600" }}>
                  {item?.name}
                </Text>
                {isOnline && <View style={styles.greenDot} />}
              </View>
              <Text
                style={{
                  width: 200,
                  marginTop: 15,
                  fontSize: 18,
                  lineHeight: 24,
                  color: "#333333",
                  marginBottom: 8,
                  fontFamily: "Optima",
                }}
              >
                {item?.description}
              </Text>
            </View>
          </View>
        </ScrollView>
        <View>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: 10,
            }}
          >
            <Entypo name="dots-three-vertical" size={26} color="gray" />
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: 20 }}
            >
              <Pressable
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 25,
                  backgroundColor: "#F0F8FF",
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <FontAwesome name="diamond" size={27} color="#0066b2" />
              </Pressable>

              {selected ? (
                <Pressable
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: "#6699CC",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <Animatable.View
                    animation="swing"
                    easing={"ease-in-out-circ"}
                    iterationCount={1}
                  >
                    <AntDesign name="heart" size={27} color="white" />
                  </Animatable.View>
                </Pressable>
              ) : (
                <Pressable
                  onPress={() => handleLikeOther(item._id)}
                  style={{
                    width: 50,
                    height: 50,
                    borderRadius: 25,
                    backgroundColor: "#6699CC",
                    justifyContent: "center",
                    alignItems: "center",
                  }}
                >
                  <AntDesign name="hearto" size={27} color="white" />
                </Pressable>
              )}
            </View>
          </View>
        </View>
        <View style={{ marginVertical: 15 }} />
      </View>
    );
  }
};

export default Profile;

const styles = StyleSheet.create({
  // Added styles for online status
  imageContainer: {
    position: 'relative',
  },
  nameContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
  },
  greenDot: {
    marginLeft: 8,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'green',
    borderWidth: 2,
    borderColor: 'white'
  },
  greenDotImage: {
    position: 'absolute',
    top: 5,
    right: 5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: 'green',
    borderWidth: 2,
    borderColor: 'white',
    zIndex: 10,
  },
});