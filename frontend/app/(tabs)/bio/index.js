// app/(tabs)/bio/index.js
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  Button,
  FlatList,
  Alert,
  ActivityIndicator,
  TouchableOpacity
} from "react-native";
import React, { useState, useEffect, useContext } from "react";
import { Entypo, AntDesign } from "@expo/vector-icons";
import Carousel from "react-native-reanimated-carousel";
import axios from "axios";
import { decode as atob } from 'base-64';
import { jwtDecode } from "jwt-decode";
import AsyncStorage from "@react-native-async-storage/async-storage";
import base64 from 'base-64';
import { useAuth } from "../../_context/AuthContext";
import { useNavigation } from "@react-navigation/native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com/";

const BioScreen = () => {
  const navigation = useNavigation();
  const { user, isSubscribed, profiles, loadProfiles } = useAuth();
  const [option, setOption] = useState("Photos");
  const [description, setDescription] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [userId, setUserId] = useState("");
  const [selectedTurnOns, setSelectedTurnOns] = useState([]);
  const [lookingOptions, setLookingOptions] = useState([]);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [userImages, setUserImages] = useState([
    "https://images.pexels.com/photos/1042140/pexels-photo-1042140.jpeg?auto=compress&cs=tinysrgb&w=800",
    "https://images.pexels.com/photos/1215695/pexels-photo-1215695.jpeg?auto=compress&cs=tinysrgb&w=800",
    "https://images.pexels.com/photos/7580971/pexels-photo-7580971.jpeg?auto=compress&cs=tinysrgb&w=800",
  ]);

  const turnons = [
    { id: "0", name: "Music", description: "Pop Rock-Indie pick our sound track" },
    { id: "10", name: "Kissing", description: "It's a feeling of closeness, where every touch of lips creates a symphony of emotions." },
    { id: "1", name: "Fantasies", description: "Fantasies can be deeply personal, encompassing diverse elements such as romance" },
    { id: "2", name: "Nibbling", description: "Playful form of biting or taking small, gentle bites, typically done with the teeth" },
    { id: "3", name: "Desire", description: "Powerful emotion or attainment of a particular person." },
  ];

  const data = [
    { id: "0", name: "Casual", description: "Let's keep it easy and see where it goes" },
    { id: "1", name: "Long Term", description: "How about a one life stand" },
    { id: "2", name: "Virtual", description: "Let's have some virtual fun" },
    { id: "3", name: "Open for Anything", description: "Let's Vibe and see where it goes" },
  ];

  useEffect(() => {
    const initialize = async () => {
      try {
        // Load user ID
        const token = await AsyncStorage.getItem("auth");
        if (token) {
          const decodedToken = jwtDecode(token);
          setUserId(decodedToken.userId);
        }

        // Load profiles
        await loadProfiles();
      } catch (error) {
        console.error("Initialization error:", error);
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (profiles && profiles.length > 0) {
      setSelectedProfile(profiles[0]);
    }
  }, [profiles]);

  const fetchUserDescription = async () => {
    try {
      const token = await AsyncStorage.getItem("auth");
      const response = await axios.get(`${API_BASE_URL}/api/users/${userId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const userData = response.data;

      setDescription(userData?.description || "");
      setSelectedTurnOns(userData?.turnOns || []);
      setUserImages(userData?.profileImages || userImages);
      setLookingOptions(userData?.lookingFor || []);
    } catch (error) {
      console.error("Error fetching user description", error);
    }
  };

  useEffect(() => {
    if (userId) {
      fetchUserDescription();
    }
  }, [userId]);

  const updateUserDescription = async () => {
    try {
      const token = await AsyncStorage.getItem("auth");
      await axios.put(
        `${API_BASE_URL}/api/users/${userId}/description`,
        { description },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      Alert.alert("Success", "Description updated successfully");
    } catch (error) {
      console.error("Error updating description", error);
      Alert.alert("Error", "Failed to update description");
    }
  };

  const handleAddImage = async () => {
    // Check subscription status and photo limit
    if (!isSubscribed && userImages.length >= 7) {
      Alert.alert(
        "Upload Limit Reached",
        "Free users can only upload up to 7 photos. Please subscribe to upload more.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Subscribe", onPress: () => navigation.navigate('Subscribe') }
        ]
      );
      return;
    }

    if (!imageUrl) {
      Alert.alert("Error", "Please enter an image URL");
      return;
    }

    try {
      const token = await AsyncStorage.getItem("auth");
      await axios.post(
        `${API_BASE_URL}/api/users/${userId}/profile-images`,
        { imageUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      setImageUrl("");
      fetchUserDescription();
      Alert.alert("Success", "Image added successfully");
    } catch (error) {
      console.error("Error adding image", error);
      Alert.alert("Error", "Failed to add image");
    }
  };

  const renderImageCarousel = ({ item }) => (
    <View style={{ width: "100%", justifyContent: "center", alignItems: "center" }}>
      <Image
        style={{
          width: "85%",
          resizeMode: "cover",
          height: 290,
          borderRadius: 10,
          transform: [{ rotate: "-5deg" }],
        }}
        source={{ uri: item }}
      />
      <Text style={{ position: "absolute", top: 10, right: 10, color: "black" }}>
        {activeSlide + 1}/{userImages.length}
      </Text>
    </View>
  );

  const renderProfileItem = ({ item }) => (
    <TouchableOpacity 
      onPress={() => setSelectedProfile(item)}
      style={{ margin: 5 }}
    >
      <Image
        source={{ uri: item.photos[0]?.url || "https://via.placeholder.com/100" }}
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          borderWidth: selectedProfile?.id === item.id ? 3 : 0,
          borderColor: '#fd5c63'
        }}
      />
      <Text style={{ textAlign: 'center', marginTop: 5 }}>{item.name}</Text>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!selectedProfile) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text>No profiles available</Text>
      </View>
    );
  }

  return (
    <ScrollView>
      {/* Profile Header */}
      <View>
        <Image
          style={{ width: "100%", height: 200, resizeMode: "cover" }}
          source={{
            uri: "https://static.vecteezy.com/system/resources/thumbnails/018/977/074/original/animated-backgrounds-with-liquid-motion-graphic-background-cool-moving-animation-for-your-background-free-video.jpg",
          }}
        />
        <View>
          <Pressable
            style={{
              padding: 10,
              backgroundColor: "#DDA0DD",
              width: 300,
              marginLeft: "auto",
              marginRight: "auto",
              justifyContent: "center",
              alignItems: "center",
              borderRadius: 10,
              position: "absolute",
              top: -60,
              left: "50%",
              transform: [{ translateX: -150 }],
            }}
          >
            <Image
              style={{
                width: 60,
                height: 60,
                borderRadius: 30,
                resizeMode: "cover",
              }}
              source={{
                uri: selectedProfile.photos[0]?.url || "https://via.placeholder.com/60",
              }}
            />
            <Text style={{ fontSize: 16, fontWeight: "600", marginTop: 6 }}>
              {selectedProfile.name}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 15 }}>
              {selectedProfile.age || 'Unknown'} years
            </Text>
          </Pressable>
        </View>
      </View>

      {/* Profile Selection */}
      {profiles.length > 1 && (
        <FlatList
          horizontal
          data={profiles}
          renderItem={renderProfileItem}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 10 }}
        />
      )}

      {/* Options Tabs */}
      <View style={{ marginTop: 20, marginHorizontal: 20, flexDirection: "row", alignItems: "center", gap: 25, justifyContent: "center" }}>
        <Pressable onPress={() => setOption("AD")}>
          <Text style={{ fontSize: 16, fontWeight: "500", color: option === "AD" ? "black" : "gray" }}>
            AD
          </Text>
        </Pressable>
        <Pressable onPress={() => setOption("Photos")}>
          <Text style={{ fontSize: 16, fontWeight: "500", color: option === "Photos" ? "black" : "gray" }}>
            Photos
          </Text>
        </Pressable>
        <Pressable onPress={() => setOption("Turn-ons")}>
          <Text style={{ fontSize: 16, fontWeight: "500", color: option === "Turn-ons" ? "black" : "gray" }}>
            Turn-ons
          </Text>
        </Pressable>
        <Pressable onPress={() => setOption("Looking For")}>
          <Text style={{ fontSize: 16, fontWeight: "500", color: option === "Looking For" ? "black" : "gray" }}>
            Looking For
          </Text>
        </Pressable>
      </View>

      {/* AD Section */}
      {option === "AD" && (
        <View style={{ marginHorizontal: 14, marginVertical: 15 }}>
          <View style={{ borderColor: "#202020", borderWidth: 1, padding: 10, borderRadius: 10, height: 300 }}>
            <TextInput
              value={description}
              multiline
              onChangeText={setDescription}
              style={{ fontFamily: "Helvetica", fontSize: description ? 17 : 17 }}
              placeholder="Write your AD for people to like you"
            />
            <Pressable
              onPress={updateUserDescription}
              style={{
                marginTop: "auto",
                flexDirection: "row",
                alignItems: "center",
                gap: 15,
                backgroundColor: "black",
                borderRadius: 5,
                justifyContent: "center",
                padding: 10,
              }}
            >
              <Text style={{ color: "white", textAlign: "center", fontSize: 15, fontWeight: "500" }}>
                Publish in feed
              </Text>
              <Entypo name="mask" size={24} color="white" />
            </Pressable>
          </View>
        </View>
      )}

      {/* Photos Section */}
      {option === "Photos" && (
        <View style={{ marginHorizontal: 14 }}>
          <Carousel
            data={isSubscribed ? selectedProfile.photos : selectedProfile.photos.slice(0, 7)}
            renderItem={renderImageCarousel}
            sliderWidth={350}
            itemWidth={300}
            onSnapToItem={setActiveSlide}
          />

          {!isSubscribed && selectedProfile.photos.length > 7 && (
            <Text style={{ textAlign: 'center', marginVertical: 10, color: '#fd5c63' }}>
              Subscribe to view all {selectedProfile.photos.length} photos
            </Text>
          )}

          {/* Image Upload Section (only for current user) */}
          {selectedProfile.id === userId && (
            <View style={{ marginTop: 25 }}>
              <Text style={{ fontSize: 16, fontWeight: "500" }}>Add a picture of yourself</Text>
              {!isSubscribed && (
                <Text style={{ color: '#fd5c63', marginBottom: 5 }}>
                  {7 - userImages.length} photos remaining (7 max for free users)
                </Text>
              )}
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 5, borderRadius: 5, marginTop: 10, backgroundColor: "#DCDCDC" }}>
                <Entypo style={{ marginLeft: 8 }} name="image" size={24} color="gray" />
                <TextInput
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  style={{ color: "gray", marginVertical: 10, width: 300 }}
                  placeholder="Enter your image URL"
                />
              </View>
              <Pressable
                onPress={handleAddImage}
                style={{
                  marginTop: 10,
                  backgroundColor: "#fd5c63",
                  padding: 10,
                  borderRadius: 5,
                  opacity: (!isSubscribed && userImages.length >= 7) ? 0.5 : 1
                }}
                disabled={!isSubscribed && userImages.length >= 7}
              >
                <Text style={{ color: "white", textAlign: "center" }}>Add Image</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Turn-ons Section */}
      {option === "Turn-ons" && (
        <View style={{ marginHorizontal: 14 }}>
          {turnons?.map((item, index) => (
            <Pressable
              onPress={() => {
                if (selectedTurnOns.includes(item.name)) {
                  setSelectedTurnOns(selectedTurnOns.filter(t => t !== item.name));
                } else {
                  setSelectedTurnOns([...selectedTurnOns, item.name]);
                }
              }}
              style={{
                backgroundColor: selectedTurnOns.includes(item.name) ? "#fd5c63" : "#FFFDD0",
                padding: 10,
                marginVertical: 10,
                borderRadius: 5,
              }}
              key={index}
            >
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ textAlign: "center", fontSize: 15, fontWeight: "bold", flex: 1, color: selectedTurnOns.includes(item.name) ? "white" : "black" }}>
                  {item.name}
                </Text>
                {selectedTurnOns.includes(item.name) && <AntDesign name="checkcircle" size={18} color="white" />}
              </View>
              <Text style={{ marginTop: 4, fontSize: 15, color: selectedTurnOns.includes(item.name) ? "white" : "gray", textAlign: "center" }}>
                {item.description}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Looking For Section */}
      {option === "Looking For" && (
        <View style={{ marginHorizontal: 14 }}>
          <FlatList
            columnWrapperStyle={{ justifyContent: "space-between" }}
            numColumns={2}
            data={data}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  if (lookingOptions.includes(item.name)) {
                    setLookingOptions(lookingOptions.filter(o => o !== item.name));
                  } else {
                    setLookingOptions([...lookingOptions, item.name]);
                  }
                }}
                style={{
                  backgroundColor: lookingOptions.includes(item.name) ? "#fd5c63" : "white",
                  padding: 16,
                  justifyContent: "center",
                  alignItems: "center",
                  width: 150,
                  margin: 10,
                  borderRadius: 5,
                  borderColor: "#fd5c63",
                  borderWidth: lookingOptions.includes(item.name) ? 0 : 0.7,
                }}
              >
                <Text style={{ textAlign: "center", fontWeight: "500", fontSize: 13, color: lookingOptions.includes(item.name) ? "white" : "black" }}>
                  {item.name}
                </Text>
                <Text style={{ color: lookingOptions.includes(item.name) ? "white" : "gray", textAlign: "center", width: 140, marginTop: 10, fontSize: 13 }}>
                  {item.description}
                </Text>
              </Pressable>
            )}
          />
        </View>
      )}
    </ScrollView>
  );
};

export default BioScreen;

const styles = StyleSheet.create({});