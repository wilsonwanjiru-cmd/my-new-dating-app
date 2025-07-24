// app/(tabs)/bio/index.js
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  Image,
  Pressable,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  TextInput
} from "react-native";
import React, { useState, useEffect } from "react";
import { Entypo, AntDesign } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import Carousel from "react-native-reanimated-carousel";
import { useAuth } from "../../_context/AuthContext";
import { useRouter } from "expo-router";
import apiClient from "../../_api/client";

const BioScreen = () => {
  const router = useRouter();
  const { 
    user, 
    isSubscribed,
    subscriptionExpiresAt,
    freePhotosViewed,
    freePhotosLimit,
    incrementPhotoView,
    canViewMorePhotos,
    updateUser
  } = useAuth();
  
  const [option, setOption] = useState("Photos");
  const [description, setDescription] = useState(user?.description || "");
  const [activeSlide, setActiveSlide] = useState(0);
  const [selectedTurnOns, setSelectedTurnOns] = useState(user?.turnOns || []);
  const [lookingOptions, setLookingOptions] = useState(user?.lookingFor || []);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [selectedGender, setSelectedGender] = useState(user?.gender || "");
  const [updatingGender, setUpdatingGender] = useState(false);
  const [updatingDescription, setUpdatingDescription] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  // Initialize state from user data
  useEffect(() => {
    if (user) {
      setDescription(user.description || "");
      setSelectedGender(user.gender || "");
      setSelectedTurnOns(user.turnOns || []);
      setLookingOptions(user.lookingFor || []);
    }
  }, [user]);

  // Constants
  const MAX_FREE_PHOTOS = 7;
  const turnons = [
    { id: "0", name: "Music", description: "Pop Rock-Indie pick our sound track" },
    { id: "1", name: "Fantasies", description: "Can be deeply personal and romantic" },
    { id: "2", name: "Nibbling", description: "Playful form of gentle bites" },
    { id: "3", name: "Desire", description: "Powerful emotion of attraction" },
  ];

  const lookingForOptions = [
    { id: "0", name: "Casual", description: "Let's keep it easy" },
    { id: "1", name: "Long Term", description: "One life stand" },
    { id: "2", name: "Virtual", description: "Virtual fun" },
    { id: "3", name: "Open", description: "Let's vibe" },
  ];

  const genderOptions = ['male', 'female', 'non-binary', 'prefer-not-to-say'];

  // Check if subscription is active
  const isSubscriptionActive = isSubscribed && 
    (!subscriptionExpiresAt || new Date(subscriptionExpiresAt) > new Date());

  // Determine visible photos based on subscription status
  const getVisiblePhotos = () => {
    if (!user?.profileImages) return [];
    if (isSubscriptionActive) return user.profileImages;
    return user.profileImages.slice(0, MAX_FREE_PHOTOS);
  };

  // Handle photo viewing
  const handleViewPhoto = async (index) => {
    if (isSubscriptionActive) return;

    if (index >= freePhotosViewed) {
      try {
        if (canViewMorePhotos && typeof canViewMorePhotos === 'function' && !canViewMorePhotos()) {
          Alert.alert(
            "Limit Reached",
            `You've viewed ${freePhotosLimit} photos today. Subscribe to view more.`,
            [
              { text: "Later" },
              { text: "Subscribe", onPress: () => router.push("/subscribe") }
            ]
          );
          return;
        }

        if (incrementPhotoView && typeof incrementPhotoView === 'function') {
          await incrementPhotoView();
        }
      } catch (error) {
        console.error("Error handling photo view:", error);
        Alert.alert("Error", "Failed to track photo view");
      }
    }
  };

  // Update user description
  const updateUserDescription = async () => {
    if (!description.trim()) {
      Alert.alert("Error", "Description cannot be empty");
      return;
    }

    try {
      setUpdatingDescription(true);
      if (updateUser && typeof updateUser === 'function') {
        await updateUser({ description });
        Alert.alert("Success", "Description updated successfully");
      } else {
        throw new Error("Update function not available");
      }
    } catch (error) {
      console.error("Update error:", error);
      Alert.alert("Error", error.message || "Failed to update description");
    } finally {
      setUpdatingDescription(false);
    }
  };

  // Update gender
  const handleGenderUpdate = async () => {
    try {
      setUpdatingGender(true);
      if (updateUser && typeof updateUser === 'function') {
        await updateUser({ gender: selectedGender });
        setShowGenderModal(false);
        Alert.alert("Success", "Gender updated successfully");
      } else {
        throw new Error("Update function not available");
      }
    } catch (error) {
      console.error("Update error:", error);
      Alert.alert("Error", error.message || "Failed to update gender");
    } finally {
      setUpdatingGender(false);
    }
  };

  // Handle photo upload
  const handlePhotoUpload = async () => {
    if (!isSubscriptionActive && user?.profileImages?.length >= MAX_FREE_PHOTOS) {
      Alert.alert(
        "Upload Limit Reached",
        `Free users can upload up to ${MAX_FREE_PHOTOS} photos. Subscribe to upload more.`,
        [
          { text: "Later" },
          { text: "Subscribe", onPress: () => router.push("/subscribe") }
        ]
      );
      return;
    }

    try {
      setUploadingPhoto(true);
      
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert("Permission required", "We need access to your photos to upload images");
        return;
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [4, 3],
        quality: 0.8,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const imageUri = result.assets[0].uri;
        
        const formData = new FormData();
        formData.append('photo', {
          uri: imageUri,
          type: 'image/jpeg',
          name: 'profile-photo.jpg'
        });

        const response = await apiClient.post('/api/photos/upload', formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
          transformRequest: (data) => data,
        });

        if (updateUser && typeof updateUser === 'function') {
          await updateUser({ 
            profileImages: [...(user?.profileImages || []), response.data.imageUrl] 
          });
        }
        
        Alert.alert("Success", "Photo uploaded successfully");
      }
    } catch (error) {
      console.error("Upload error:", error);
      let errorMessage = "Failed to upload photo";
      
      if (error.response) {
        errorMessage = error.response.data?.message || 
                      `Server responded with ${error.response.status}`;
      } else if (error.request) {
        errorMessage = "No response from server. Please check your connection.";
      } else {
        errorMessage = error.message || "Network request failed";
      }
      
      Alert.alert("Upload Failed", errorMessage);
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Render carousel item with view limits
  const renderImageCarousel = ({ item, index }) => {
    const imageUrl = typeof item === 'string' ? item : item.url;
    return (
      <TouchableOpacity 
        onPress={() => handleViewPhoto(index)}
        activeOpacity={0.8}
      >
        <View style={styles.carouselItem}>
          <Image
            style={styles.carouselImage}
            source={{ uri: imageUrl }}
          />
          {!isSubscriptionActive && index >= MAX_FREE_PHOTOS && (
            <View style={styles.lockedOverlay}>
              <Text style={styles.lockedText}>Subscribe to view</Text>
            </View>
          )}
          {!isSubscriptionActive && index < MAX_FREE_PHOTOS && index >= freePhotosViewed && (
            <View style={styles.viewCountOverlay}>
              <Text style={styles.viewCountText}>
                {freePhotosViewed}/{freePhotosLimit} views used
              </Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  // Format gender display text
  const formatGenderText = (gender) => {
    return gender.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('-');
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <Image
          style={styles.headerImage}
          source={{ uri: "https://example.com/header-background.jpg" }}
        />
        <View style={styles.profileBadge}>
          <Image
            style={styles.profileImage}
            source={{ 
              uri: user?.profileImages?.[0]?.url || 
                   user?.profileImages?.[0] || 
                   "https://via.placeholder.com/100" 
            }}
          />
          <Text style={styles.profileName}>{user?.name || "User"}</Text>
          <Text style={styles.profileAge}>{user?.age || ''} years</Text>
          <TouchableOpacity onPress={() => setShowGenderModal(true)}>
            <Text style={styles.genderText}>
              {user?.gender ? formatGenderText(user.gender) : 'Set gender'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
              onChangeText={setDescription}
              style={styles.descriptionInput}
              placeholder="Tell others about yourself..."
              placeholderTextColor="#888"
              multiline
              numberOfLines={4}
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
                  <Text style={styles.publishButtonText}>Update Profile</Text>
                  <Entypo name="edit" size={20} color="white" />
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Photos Section */}
      {option === "Photos" && (
        <View style={styles.sectionContainer}>
          {user?.profileImages?.length > 0 ? (
            <>
              <Carousel
                data={getVisiblePhotos()}
                renderItem={renderImageCarousel}
                sliderWidth={350}
                itemWidth={300}
                onSnapToItem={setActiveSlide}
              />
              
              {!isSubscriptionActive && (
                <Text style={styles.photoCounter}>
                  {Math.min(freePhotosViewed, freePhotosLimit)}/{freePhotosLimit} photos viewed today
                </Text>
              )}
              
              {!isSubscriptionActive && user?.profileImages?.length > MAX_FREE_PHOTOS && (
                <Text style={styles.subscribePrompt}>
                  Subscribe to view all {user.profileImages.length} photos
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.noPhotosText}>No photos available</Text>
          )}

          {/* Photo Upload Section */}
          <View style={styles.uploadContainer}>
            <Text style={styles.uploadTitle}>Add new photos</Text>
            
            {!isSubscriptionActive && (
              <Text style={styles.remainingPhotosText}>
                {MAX_FREE_PHOTOS - (user?.profileImages?.length || 0)} of {MAX_FREE_PHOTOS} free uploads remaining
              </Text>
            )}
            
            <Pressable
              onPress={handlePhotoUpload}
              style={[
                styles.uploadButton,
                (!isSubscriptionActive && (user?.profileImages?.length || 0) >= MAX_FREE_PHOTOS) && 
                  styles.disabledButton
              ]}
              disabled={(!isSubscriptionActive && (user?.profileImages?.length || 0) >= MAX_FREE_PHOTOS) || uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Entypo name="camera" size={20} color="white" style={styles.uploadIcon} />
                  <Text style={styles.uploadButtonText}>
                    {isSubscriptionActive ? "Upload Photo" : "Upload (Free)"}
                  </Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
      )}

      {/* Gender Update Modal */}
      <Modal
        visible={showGenderModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowGenderModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Select Your Gender</Text>
            
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
                  {formatGenderText(gender)}
                </Text>
              </TouchableOpacity>
            ))}

            <View style={styles.modalButtons}>
              <TouchableOpacity 
                style={styles.cancelButton}
                onPress={() => setShowGenderModal(false)}
              >
                <Text style={[styles.buttonText, { color: '#000' }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={styles.saveButton}
                onPress={handleGenderUpdate}
                disabled={updatingGender}
              >
                {updatingGender ? (
                  <ActivityIndicator color="white" />
                ) : (
                  <Text style={styles.buttonText}>Save</Text>
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
  profileHeader: {
    position: 'relative',
    marginBottom: 60
  },
  headerImage: {
    width: '100%',
    height: 180,
    resizeMode: 'cover'
  },
  profileBadge: {
    position: 'absolute',
    bottom: -50,
    left: '50%',
    transform: [{ translateX: -50 }],
    width: 100,
    alignItems: 'center',
    backgroundColor: '#fff',
    padding: 10,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2
  },
  profileImage: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: '#fd5c63'
  },
  profileName: {
    marginTop: 5,
    fontWeight: '600'
  },
  profileAge: {
    color: '#666',
    fontSize: 12
  },
  genderText: {
    color: '#007AFF',
    fontSize: 12,
    marginTop: 2
  },
  tabsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  tabText: {
    fontSize: 16,
    color: '#666'
  },
  activeTab: {
    color: '#fd5c63',
    fontWeight: '600',
    borderBottomWidth: 2,
    borderBottomColor: '#fd5c63'
  },
  sectionContainer: {
    padding: 15
  },
  descriptionInputContainer: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    minHeight: 150,
    padding: 10
  },
  descriptionInput: {
    flex: 1,
    textAlignVertical: 'top'
  },
  publishButton: {
    backgroundColor: '#fd5c63',
    padding: 10,
    borderRadius: 5,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10
  },
  publishButtonText: {
    color: '#fff',
    fontWeight: '600',
    marginRight: 5
  },
  carouselItem: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  carouselImage: {
    width: '85%',
    height: 300,
    borderRadius: 10,
    transform: [{ rotate: '-5deg' }]
  },
  lockedOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.7)',
    width: '85%',
    height: 300,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    transform: [{ rotate: '-5deg' }]
  },
  lockedText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16
  },
  viewCountOverlay: {
    position: 'absolute',
    bottom: 10,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 5,
    borderRadius: 5,
    alignItems: 'center'
  },
  viewCountText: {
    color: '#fff',
    fontSize: 12
  },
  photoCounter: {
    textAlign: 'center',
    marginTop: 10,
    color: '#666'
  },
  subscribePrompt: {
    textAlign: 'center',
    color: '#fd5c63',
    marginTop: 10,
    fontWeight: '500'
  },
  noPhotosText: {
    textAlign: 'center',
    marginVertical: 20,
    color: '#888'
  },
  uploadContainer: {
    marginTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingTop: 20
  },
  uploadTitle: {
    fontWeight: '600',
    marginBottom: 5
  },
  remainingPhotosText: {
    color: '#666',
    fontSize: 12,
    marginBottom: 15
  },
  uploadButton: {
    backgroundColor: '#fd5c63',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center'
  },
  disabledButton: {
    opacity: 0.5
  },
  uploadButtonText: {
    color: '#fff',
    fontWeight: '600'
  },
  uploadIcon: {
    marginRight: 10
  },
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)'
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 10,
    padding: 20,
    width: '80%'
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center'
  },
  genderOption: {
    padding: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#eee'
  },
  selectedGenderOption: {
    backgroundColor: '#f5f5f5'
  },
  genderOptionText: {
    fontSize: 16
  },
  selectedGenderOptionText: {
    color: '#fd5c63',
    fontWeight: '600'
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20
  },
  cancelButton: {
    padding: 10,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#ccc',
    flex: 1,
    marginRight: 10,
    alignItems: 'center'
  },
  saveButton: {
    backgroundColor: '#fd5c63',
    padding: 10,
    borderRadius: 5,
    flex: 1,
    alignItems: 'center'
  },
  buttonText: {
    color: 'white',
    fontWeight: '600'
  }
});

export default BioScreen;