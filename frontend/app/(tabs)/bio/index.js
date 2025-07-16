// app/(tabs)/bio/index.js
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Pressable,
  TextInput,
  FlatList,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Modal
} from "react-native";
import React, { useState, useEffect, useContext } from "react";
import { Entypo, AntDesign } from "@expo/vector-icons";
import Carousel from "react-native-reanimated-carousel";
import axios from "axios";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useAuth } from "../../_context/AuthContext";
import { useNavigation } from "@react-navigation/native";

const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL || "https://dating-app-3eba.onrender.com";

const BioScreen = () => {
  const navigation = useNavigation();
  const { 
    user, 
    isSubscribed, 
    profiles, 
    loadProfiles,
    updateUser,
    subscriptionExpiresAt
  } = useAuth();
  
  const [option, setOption] = useState("Photos");
  const [description, setDescription] = useState("");
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedTurnOns, setSelectedTurnOns] = useState([]);
  const [lookingOptions, setLookingOptions] = useState([]);
  const [imageUrl, setImageUrl] = useState("");
  const [loading, setLoading] = useState(true);
  const [selectedProfile, setSelectedProfile] = useState(null);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [selectedGender, setSelectedGender] = useState("");
  const [updatingGender, setUpdatingGender] = useState(false);
  const [updatingDescription, setUpdatingDescription] = useState(false);
  const [addingImage, setAddingImage] = useState(false);

  const turnons = [
    { id: "0", name: "Music", description: "Pop Rock-Indie pick our sound track" },
    { id: "10", name: "Kissing", description: "It's a feeling of closeness, where every touch of lips creates a symphony of emotions." },
    { id: "1", name: "Fantasies", description: "Fantasies can be deeply personal, encompassing diverse elements such as romance" },
    { id: "2", name: "Nibbling", description: "Playful form of biting or taking small, gentle bites, typically done with the teeth" },
    { id: "3", name: "Desire", description: "Powerful emotion or attainment of a particular person." },
  ];

  const lookingForOptions = [
    { id: "0", name: "Casual", description: "Let's keep it easy and see where it goes" },
    { id: "1", name: "Long Term", description: "How about a one life stand" },
    { id: "2", name: "Virtual", description: "Let's have some virtual fun" },
    { id: "3", name: "Open for Anything", description: "Let's Vibe and see where it goes" },
  ];

  const genderOptions = ['male', 'female', 'non-binary', 'prefer-not-to-say'];

  useEffect(() => {
    const initialize = async () => {
      try {
        await loadProfiles();
      } catch (error) {
        console.error("Initialization error:", error);
        Alert.alert("Error", "Failed to load profiles");
      } finally {
        setLoading(false);
      }
    };

    initialize();
  }, []);

  useEffect(() => {
    if (profiles && profiles.length > 0) {
      const currentUserProfile = profiles.find(p => p._id === user?._id) || profiles[0];
      setSelectedProfile(currentUserProfile);
      setDescription(currentUserProfile?.description || "");
      setSelectedTurnOns(currentUserProfile?.turnOns || []);
      setLookingOptions(currentUserProfile?.lookingFor || []);
      setSelectedGender(currentUserProfile?.gender || "");
    }
  }, [profiles, user]);

  const updateUserDescription = async () => {
    if (!description.trim()) {
      Alert.alert("Error", "Description cannot be empty");
      return;
    }

    try {
      setUpdatingDescription(true);
      const token = await AsyncStorage.getItem("auth");
      await axios.put(
        `${API_BASE_URL}/api/users/${user._id}/description`,
        { description },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Update local state
      const updatedProfile = { ...selectedProfile, description };
      setSelectedProfile(updatedProfile);
      
      // Update global user context
      updateUser({ ...user, description });
      
      Alert.alert("Success", "Description updated successfully");
    } catch (error) {
      console.error("Error updating description", error);
      const errorMessage = error.response?.data?.message || "Failed to update description";
      Alert.alert("Error", errorMessage);
    } finally {
      setUpdatingDescription(false);
    }
  };

  const handleGenderUpdate = async () => {
    if (!selectedGender || selectedGender === user?.gender) {
      setShowGenderModal(false);
      return;
    }

    try {
      setUpdatingGender(true);
      const token = await AsyncStorage.getItem("auth");
      const response = await axios.put(
        `${API_BASE_URL}/api/users/${user._id}/gender`,
        { gender: selectedGender },
        { headers: { 
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}` 
        }}
      );

      // Update local state
      const updatedProfile = { ...selectedProfile, gender: selectedGender };
      setSelectedProfile(updatedProfile);
      
      // Update global user context
      updateUser({ ...user, gender: selectedGender });
      
      Alert.alert("Success", "Gender updated successfully");
      setShowGenderModal(false);
    } catch (error) {
      console.error("Gender update error:", error);
      const errorMessage = error.response?.data?.message || "Failed to update gender";
      Alert.alert("Error", errorMessage);
    } finally {
      setUpdatingGender(false);
    }
  };

  const handleAddImage = async () => {
    // Check subscription status and photo limit
    const isExpired = subscriptionExpiresAt && new Date(subscriptionExpiresAt) < new Date();
    const photoLimitReached = !isSubscribed || isExpired 
      ? selectedProfile?.profileImages?.length >= 7
      : false;

    if (photoLimitReached) {
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

    if (!imageUrl.trim()) {
      Alert.alert("Error", "Please enter a valid image URL");
      return;
    }

    try {
      setAddingImage(true);
      const token = await AsyncStorage.getItem("auth");
      await axios.post(
        `${API_BASE_URL}/api/users/${user._id}/profile-images`,
        { imageUrl },
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      // Refresh profile data
      await loadProfiles();
      
      setImageUrl("");
      Alert.alert("Success", "Image added successfully");
    } catch (error) {
      console.error("Error adding image", error);
      const errorMessage = error.response?.data?.message || "Failed to add image";
      Alert.alert("Error", errorMessage);
    } finally {
      setAddingImage(false);
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
        {activeSlide + 1}/{selectedProfile?.profileImages?.length || 0}
      </Text>
    </View>
  );

  const renderProfileItem = ({ item }) => (
    <TouchableOpacity 
      onPress={() => setSelectedProfile(item)}
      style={{ margin: 5 }}
    >
      <Image
        source={{ uri: item.profileImages?.[0] || "https://via.placeholder.com/100" }}
        style={{
          width: 80,
          height: 80,
          borderRadius: 40,
          borderWidth: selectedProfile?._id === item._id ? 3 : 0,
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

  const isOwnProfile = selectedProfile?._id === user?._id;
  const isExpired = subscriptionExpiresAt && new Date(subscriptionExpiresAt) < new Date();
  const visiblePhotos = (isSubscribed && !isExpired) 
    ? selectedProfile?.profileImages || []
    : (selectedProfile?.profileImages || []).slice(0, 7);

  return (
    <ScrollView style={styles.container}>
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
                uri: selectedProfile.profileImages?.[0] || "https://via.placeholder.com/60",
              }}
            />
            <Text style={{ fontSize: 16, fontWeight: "600", marginTop: 6 }}>
              {selectedProfile.name}
            </Text>
            <Text style={{ marginTop: 4, fontSize: 15 }}>
              {selectedProfile.age || 'Unknown'} years
            </Text>
            {isOwnProfile && (
              <TouchableOpacity 
                onPress={() => setShowGenderModal(true)}
                style={{ marginTop: 4 }}
              >
                <Text style={{ color: '#007AFF' }}>
                  {selectedGender || 'Set gender'}
                </Text>
              </TouchableOpacity>
            )}
          </Pressable>
        </View>
      </View>

      {/* Profile Selection */}
      {profiles.length > 1 && (
        <FlatList
          horizontal
          data={profiles}
          renderItem={renderProfileItem}
          keyExtractor={item => item._id}
          contentContainerStyle={{ padding: 10 }}
        />
      )}

      {/* Options Tabs */}
      <View style={styles.tabsContainer}>
        <Pressable onPress={() => setOption("AD")}>
          <Text style={[styles.tabText, option === "AD" && styles.activeTab]}>
            AD
          </Text>
        </Pressable>
        <Pressable onPress={() => setOption("Photos")}>
          <Text style={[styles.tabText, option === "Photos" && styles.activeTab]}>
            Photos
          </Text>
        </Pressable>
        <Pressable onPress={() => setOption("Turn-ons")}>
          <Text style={[styles.tabText, option === "Turn-ons" && styles.activeTab]}>
            Turn-ons
          </Text>
        </Pressable>
        <Pressable onPress={() => setOption("Looking For")}>
          <Text style={[styles.tabText, option === "Looking For" && styles.activeTab]}>
            Looking For
          </Text>
        </Pressable>
      </View>

      {/* AD Section */}
      {option === "AD" && (
        <View style={styles.sectionContainer}>
          <View style={styles.descriptionInputContainer}>
            <TextInput
              value={description}
              multiline
              onChangeText={setDescription}
              style={styles.descriptionInput}
              placeholder="Write your AD for people to like you"
              placeholderTextColor="#888"
            />
            <Pressable
              onPress={updateUserDescription}
              style={styles.publishButton}
              disabled={updatingDescription}
            >
              {updatingDescription ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Text style={styles.publishButtonText}>Publish in feed</Text>
                  <Entypo name="mask" size={24} color="white" />
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Photos Section */}
      {option === "Photos" && (
        <View style={styles.sectionContainer}>
          {selectedProfile.profileImages?.length > 0 ? (
            <>
              <Carousel
                data={visiblePhotos}
                renderItem={renderImageCarousel}
                sliderWidth={350}
                itemWidth={300}
                onSnapToItem={setActiveSlide}
              />

              {(!isSubscribed || isExpired) && selectedProfile.profileImages.length > 7 && (
                <Text style={styles.subscribeText}>
                  Subscribe to view all {selectedProfile.profileImages.length} photos
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.noPhotosText}>No photos available</Text>
          )}

          {/* Image Upload Section (only for current user) */}
          {isOwnProfile && (
            <View style={styles.uploadContainer}>
              <Text style={styles.uploadTitle}>Add a picture of yourself</Text>
              {(!isSubscribed || isExpired) && (
                <Text style={styles.photoLimitText}>
                  {7 - selectedProfile.profileImages.length} photos remaining (7 max for free users)
                </Text>
              )}
              <View style={styles.urlInputContainer}>
                <Entypo style={{ marginLeft: 8 }} name="image" size={24} color="gray" />
                <TextInput
                  value={imageUrl}
                  onChangeText={setImageUrl}
                  style={styles.urlInput}
                  placeholder="Enter your image URL"
                  placeholderTextColor="#888"
                />
              </View>
              <Pressable
                onPress={handleAddImage}
                style={[
                  styles.addImageButton,
                  ((!isSubscribed || isExpired) && selectedProfile.profileImages.length >= 7) && styles.disabledButton
                ]}
                disabled={((!isSubscribed || isExpired) && selectedProfile.profileImages.length >= 7) || addingImage}
              >
                {addingImage ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.addImageButtonText}>Add Image</Text>
                )}
              </Pressable>
            </View>
          )}
        </View>
      )}

      {/* Turn-ons Section */}
      {option === "Turn-ons" && (
        <View style={styles.sectionContainer}>
          {turnons?.map((item) => (
            <Pressable
              onPress={() => {
                if (selectedTurnOns.includes(item.name)) {
                  setSelectedTurnOns(selectedTurnOns.filter(t => t !== item.name));
                } else {
                  setSelectedTurnOns([...selectedTurnOns, item.name]);
                }
              }}
              style={[
                styles.turnOnItem,
                selectedTurnOns.includes(item.name) && styles.selectedTurnOnItem
              ]}
              key={item.id}
            >
              <View style={styles.turnOnContent}>
                <Text style={[
                  styles.turnOnName,
                  selectedTurnOns.includes(item.name) && styles.selectedTurnOnText
                ]}>
                  {item.name}
                </Text>
                {selectedTurnOns.includes(item.name) && <AntDesign name="checkcircle" size={18} color="white" />}
              </View>
              <Text style={[
                styles.turnOnDescription,
                selectedTurnOns.includes(item.name) && styles.selectedTurnOnText
              ]}>
                {item.description}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {/* Looking For Section */}
      {option === "Looking For" && (
        <View style={styles.sectionContainer}>
          <FlatList
            columnWrapperStyle={styles.lookingForGrid}
            numColumns={2}
            data={lookingForOptions}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  if (lookingOptions.includes(item.name)) {
                    setLookingOptions(lookingOptions.filter(o => o !== item.name));
                  } else {
                    setLookingOptions([...lookingOptions, item.name]);
                  }
                }}
                style={[
                  styles.lookingForItem,
                  lookingOptions.includes(item.name) && styles.selectedLookingForItem,
                  !lookingOptions.includes(item.name) && styles.unselectedLookingForItem
                ]}
              >
                <Text style={[
                  styles.lookingForName,
                  lookingOptions.includes(item.name) && styles.selectedLookingForText
                ]}>
                  {item.name}
                </Text>
                <Text style={[
                  styles.lookingForDescription,
                  lookingOptions.includes(item.name) && styles.selectedLookingForText
                ]}>
                  {item.description}
                </Text>
              </Pressable>
            )}
            keyExtractor={item => item.id}
          />
        </View>
      )}

      {/* Gender Update Modal */}
      <Modal
        visible={showGenderModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowGenderModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Update Gender</Text>
            
            <View style={styles.genderOptionsContainer}>
              {genderOptions.map(gender => (
                <TouchableOpacity
                  key={gender}
                  style={[
                    styles.genderOption,
                    selectedGender === gender && styles.selectedGenderOption
                  ]}
                  onPress={() => setSelectedGender(gender)}
                >
                  <Text style={[
                    styles.genderOptionText,
                    selectedGender === gender && styles.selectedGenderOptionText
                  ]}>
                    {gender.charAt(0).toUpperCase() + gender.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtonsContainer}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setShowGenderModal(false)}
              >
                <Text style={styles.buttonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.updateButton}
                onPress={handleGenderUpdate}
                disabled={updatingGender}
              >
                {updatingGender ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Update</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  tabsContainer: {
    marginTop: 20,
    marginHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    gap: 25,
    justifyContent: "center"
  },
  tabText: {
    fontSize: 16,
    fontWeight: "500",
    color: "gray"
  },
  activeTab: {
    color: "black",
    borderBottomWidth: 2,
    borderBottomColor: "#fd5c63"
  },
  sectionContainer: {
    marginHorizontal: 14,
    marginVertical: 15
  },
  descriptionInputContainer: {
    borderColor: "#202020",
    borderWidth: 1,
    padding: 10,
    borderRadius: 10,
    minHeight: 300
  },
  descriptionInput: {
    fontFamily: "Helvetica",
    fontSize: 17,
    flex: 1,
    textAlignVertical: 'top'
  },
  publishButton: {
    marginTop: "auto",
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    backgroundColor: "black",
    borderRadius: 5,
    justifyContent: "center",
    padding: 10,
  },
  publishButtonText: {
    color: "white",
    textAlign: "center",
    fontSize: 15,
    fontWeight: "500"
  },
  subscribeText: {
    textAlign: 'center',
    marginVertical: 10,
    color: '#fd5c63'
  },
  noPhotosText: {
    textAlign: 'center',
    marginVertical: 20,
    color: '#888'
  },
  uploadContainer: {
    marginTop: 25
  },
  uploadTitle: {
    fontSize: 16,
    fontWeight: "500"
  },
  photoLimitText: {
    color: '#fd5c63',
    marginBottom: 5
  },
  urlInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingVertical: 5,
    borderRadius: 5,
    marginTop: 10,
    backgroundColor: "#DCDCDC"
  },
  urlInput: {
    color: "gray",
    marginVertical: 10,
    width: '80%'
  },
  addImageButton: {
    marginTop: 10,
    backgroundColor: "#fd5c63",
    padding: 10,
    borderRadius: 5,
  },
  disabledButton: {
    opacity: 0.5
  },
  addImageButtonText: {
    color: "white",
    textAlign: "center"
  },
  turnOnItem: {
    backgroundColor: "#FFFDD0",
    padding: 10,
    marginVertical: 10,
    borderRadius: 5,
  },
  selectedTurnOnItem: {
    backgroundColor: "#fd5c63",
  },
  turnOnContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center"
  },
  turnOnName: {
    textAlign: "center",
    fontSize: 15,
    fontWeight: "bold",
    flex: 1,
    color: "black"
  },
  selectedTurnOnText: {
    color: "white"
  },
  turnOnDescription: {
    marginTop: 4,
    fontSize: 15,
    color: "gray",
    textAlign: "center"
  },
  lookingForGrid: {
    justifyContent: "space-between"
  },
  lookingForItem: {
    padding: 16,
    justifyContent: "center",
    alignItems: "center",
    width: '47%',
    marginVertical: 10,
    borderRadius: 5,
  },
  selectedLookingForItem: {
    backgroundColor: "#fd5c63",
  },
  unselectedLookingForItem: {
    backgroundColor: "white",
    borderColor: "#fd5c63",
    borderWidth: 0.7,
  },
  lookingForName: {
    textAlign: "center",
    fontWeight: "500",
    fontSize: 13,
    color: "black"
  },
  selectedLookingForText: {
    color: "white"
  },
  lookingForDescription: {
    color: "gray",
    textAlign: "center",
    width: '100%',
    marginTop: 10,
    fontSize: 13
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContent: {
    width: '80%',
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  genderOptionsContainer: {
    marginBottom: 20,
  },
  genderOption: {
    padding: 12,
    marginVertical: 4,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  selectedGenderOption: {
    backgroundColor: '#007AFF',
  },
  genderOptionText: {
    fontSize: 16,
    textAlign: 'center',
  },
  selectedGenderOptionText: {
    color: 'white',
  },
  modalButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    padding: 12,
    marginRight: 8,
    borderRadius: 8,
    backgroundColor: '#ccc',
    alignItems: 'center',
  },
  updateButton: {
    flex: 1,
    padding: 12,
    marginLeft: 8,
    borderRadius: 8,
    backgroundColor: '#007AFF',
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});

export default BioScreen;