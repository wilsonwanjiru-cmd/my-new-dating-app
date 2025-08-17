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
  Dimensions
} from "react-native";
import React, { useState, useEffect } from "react";
import { Entypo, AntDesign, FontAwesome, MaterialIcons } from "@expo/vector-icons";
import * as ImagePicker from 'expo-image-picker';
import Carousel from "react-native-reanimated-carousel";
import { useAuth } from "../../_context/AuthContext";
import { useRouter } from "expo-router";
import apiClient from "../../_api/client";

const { width } = Dimensions.get('window');

const BioScreen = () => {
  const router = useRouter();
  const { 
    user, 
    isSubscribed,
    likePhoto,
    startChat,
    updateUser
  } = useAuth();
  
  const [option, setOption] = useState("Photos");
  const [activeSlide, setActiveSlide] = useState(0);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [selectedGender, setSelectedGender] = useState(user?.gender || "");
  const [updatingGender, setUpdatingGender] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [likedPhotos, setLikedPhotos] = useState([]);

  // Initialize state from user data
  useEffect(() => {
    if (user) {
      setSelectedGender(user.gender || "");
      // Initialize liked photos from user data if available
      if (user.likedPhotos) {
        setLikedPhotos(user.likedPhotos);
      }
    }
  }, [user]);

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

  // Handle photo like
  const handleLike = async (photoId) => {
    try {
      const result = await likePhoto(photoId);
      if (result.success) {
        setLikedPhotos(prev => 
          prev.includes(photoId) 
            ? prev.filter(id => id !== photoId) 
            : [...prev, photoId]
        );
      }
    } catch (error) {
      console.error("Error liking photo:", error);
    }
  };

  // Handle chat initiation
  const handleChat = async () => {
    if (!isSubscribed) {
      Alert.alert(
        "Subscribe to Chat",
        "You need to subscribe to start chatting with other users",
        [
          { text: "Later" },
          { text: "Subscribe", onPress: () => router.push("/subscribe") }
        ]
      );
      return;
    }
    // Implement your chat initiation logic here
    router.push("/chat");
  };

  // Handle photo upload
  const handlePhotoUpload = async () => {
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

        await updateUser({ 
          profileImages: [...(user?.profileImages || []), response.data.imageUrl] 
        });
        
        Alert.alert("Success", "Photo uploaded successfully");
      }
    } catch (error) {
      console.error("Upload error:", error);
      Alert.alert("Upload Failed", "Failed to upload photo. Please try again.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  // Render carousel item with like and chat buttons
  const renderImageCarousel = ({ item, index }) => {
    const imageUrl = typeof item === 'string' ? item : item.url;
    const photoId = item._id || index.toString();
    const isLiked = likedPhotos.includes(photoId);

    return (
      <View style={styles.carouselItem}>
        <Image
          style={styles.carouselImage}
          source={{ uri: imageUrl }}
        />
        <View style={styles.photoActions}>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => handleLike(photoId)}
          >
            <AntDesign 
              name={isLiked ? "heart" : "hearto"} 
              size={24} 
              color={isLiked ? "#fd5c63" : "white"} 
            />
            <Text style={styles.actionButtonText}>
              {item.likes || 0}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.actionButton}
            onPress={handleChat}
          >
            <MaterialIcons name="chat" size={24} color="white" />
            <Text style={styles.actionButtonText}>Chat</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // Format gender display text
  const formatGenderText = (gender) => {
    return gender.split('-').map(word => 
      word.charAt(0).toUpperCase() + word.slice(1)
    ).join('-');
  };

  // Update gender
  const handleGenderUpdate = async () => {
    try {
      setUpdatingGender(true);
      await updateUser({ gender: selectedGender });
      setShowGenderModal(false);
      Alert.alert("Success", "Gender updated successfully");
    } catch (error) {
      console.error("Update error:", error);
      Alert.alert("Error", "Failed to update gender");
    } finally {
      setUpdatingGender(false);
    }
  };

  return (
    <ScrollView style={styles.container}>
      {/* Profile Header */}
      <View style={styles.profileHeader}>
        <View style={styles.headerImagePlaceholder} />
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

      {/* Photos Section */}
      {option === "Photos" && (
        <View style={styles.sectionContainer}>
          {user?.profileImages?.length > 0 ? (
            <>
              <Carousel
                data={user.profileImages}
                renderItem={renderImageCarousel}
                width={width}
                height={400}
                onSnapToItem={setActiveSlide}
              />
            </>
          ) : (
            <Text style={styles.noPhotosText}>No photos available</Text>
          )}

          {/* Photo Upload Section */}
          <View style={styles.uploadContainer}>
            <Pressable
              onPress={handlePhotoUpload}
              style={styles.uploadButton}
              disabled={uploadingPhoto}
            >
              {uploadingPhoto ? (
                <ActivityIndicator color="white" />
              ) : (
                <>
                  <Entypo name="camera" size={20} color="white" style={styles.uploadIcon} />
                  <Text style={styles.uploadButtonText}>Upload Photo</Text>
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
  headerImagePlaceholder: {
    width: '100%',
    height: 180,
    backgroundColor: '#fd5c63'
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
  carouselItem: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative'
  },
  carouselImage: {
    width: '90%',
    height: 350,
    borderRadius: 10,
  },
  photoActions: {
    position: 'absolute',
    bottom: 20,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 40
  },
  actionButton: {
    backgroundColor: 'rgba(0,0,0,0.5)',
    padding: 10,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center'
  },
  actionButtonText: {
    color: 'white',
    marginLeft: 5,
    fontWeight: 'bold'
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
  uploadButton: {
    backgroundColor: '#fd5c63',
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center'
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