// frontend/app/(tabs)/profile/index.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  FlatList,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Modal,
  TextInput
} from 'react-native';
import { useAuth } from '../../_context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { useNavigation } from 'expo-router';
import SubscribeOverlay from '../../../components/SubscribeOverlay';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || 'https://dating-app-3eba.onrender.com';

export default function ProfileScreen({ route }) {
  const navigation = useNavigation();
  const { user: routeUser } = route?.params || {};
  const { user: currentUser, isSubscribed, subscriptionExpiresAt, updateUser } = useAuth();

  const profileUser = routeUser || currentUser;
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [visiblePhotos, setVisiblePhotos] = useState([]);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [selectedGender, setSelectedGender] = useState('');
  const [updatingGender, setUpdatingGender] = useState(false);

  const isExpired = subscriptionExpiresAt && new Date(subscriptionExpiresAt).getTime() < new Date().getTime();

  useEffect(() => {
    if (!profileUser?._id) return;

    const fetchProfileData = async () => {
      try {
        const token = await AsyncStorage.getItem('auth');
        const response = await axios.get(`${API_BASE_URL}/api/users/${profileUser._id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        setProfileData(response.data);
        setSelectedGender(response.data.gender || '');
        setVisiblePhotos(
          (!isSubscribed || isExpired || profileUser._id !== currentUser._id) 
            ? response.data.profileImages.slice(0, 7) 
            : response.data.profileImages
        );
      } catch (error) {
        console.error('Error fetching profile:', error);
        Alert.alert('Error', 'Unable to fetch profile data.');
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [profileUser?._id, isSubscribed, isExpired]);

  const handleGenderUpdate = async () => {
    if (!selectedGender || selectedGender === profileData?.gender) {
      setShowGenderModal(false);
      return;
    }

    try {
      setUpdatingGender(true);
      const token = await AsyncStorage.getItem('auth');
      const response = await axios.put(
        `${API_BASE_URL}/api/users/${currentUser._id}/gender`,
        { gender: selectedGender },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        }
      );

      setProfileData(prev => ({ ...prev, gender: selectedGender }));
      updateUser({ ...currentUser, gender: selectedGender });
      Alert.alert('Success', 'Gender updated successfully');
      setShowGenderModal(false);
    } catch (error) {
      console.error('Gender update error:', error);
      Alert.alert(
        'Error', 
        error.response?.data?.message || 'Failed to update gender'
      );
    } finally {
      setUpdatingGender(false);
    }
  };

  if (!profileUser?._id) {
    return (
      <View style={styles.centered}>
        <Text>No profile selected.</Text>
      </View>
    );
  }

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!profileData) {
    return (
      <View style={styles.centered}>
        <Text>Profile not found</Text>
      </View>
    );
  }

  const handleSubscriptionPress = () => {
    setShowSubscribeModal(false);
    navigation.navigate('subscribe');
  };

  const isOwnProfile = profileUser._id === currentUser._id;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{profileData.name}</Text>
        <Text style={styles.age}>{profileData.age ? `${profileData.age} years` : ''}</Text>
      </View>

      {/* Gender Section */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gender</Text>
        {isOwnProfile ? (
          <TouchableOpacity 
            onPress={() => setShowGenderModal(true)}
            style={styles.editField}
          >
            <Text style={styles.fieldValue}>
              {profileData.gender || 'Not specified'}
              <Text style={styles.editText}> (Edit)</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.fieldValue}>
            {profileData.gender || 'Not specified'}
          </Text>
        )}
      </View>

      <Text style={styles.description}>{profileData.description || 'No description yet'}</Text>

      {isOwnProfile && isExpired && (
        <TouchableOpacity style={styles.renewButton} onPress={handleSubscriptionPress}>
          <Text style={styles.renewButtonText}>Renew Subscription</Text>
        </TouchableOpacity>
      )}

      <View style={styles.photosContainer}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <FlatList
          data={visiblePhotos}
          numColumns={3}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <Image source={{ uri: item }} style={styles.photo} resizeMode="cover" />
          )}
          ListFooterComponent={
            !isOwnProfile && !isSubscribed && profileData.profileImages.length > 7 && (
              <TouchableOpacity
                style={styles.subscribeButton}
                onPress={() => setShowSubscribeModal(true)}
              >
                <Text style={styles.subscribeButtonText}>
                  Subscribe to view all {profileData.profileImages.length} photos
                </Text>
              </TouchableOpacity>
            )
          }
        />
      </View>

      {!isOwnProfile && (
        <TouchableOpacity style={styles.likeButton}>
          <Text style={styles.likeButtonText}>Like</Text>
        </TouchableOpacity>
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
            
            <View style={styles.genderOptions}>
              {['male', 'female', 'non-binary', 'prefer-not-to-say'].map(gender => (
                <TouchableOpacity
                  key={gender}
                  style={[
                    styles.genderOption,
                    selectedGender === gender && styles.selectedGenderOption
                  ]}
                  onPress={() => setSelectedGender(gender)}
                >
                  <Text style={styles.genderOptionText}>
                    {gender.charAt(0).toUpperCase() + gender.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalButtons}>
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

      <SubscribeOverlay
        visible={showSubscribeModal}
        message={`Subscribe to view all ${profileData.profileImages.length} photos`}
        onSubscribe={handleSubscriptionPress}
        onClose={() => setShowSubscribeModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  // ... (keep all your existing styles)

  section: {
    marginBottom: 16,
  },
  editField: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
  },
  fieldValue: {
    fontSize: 16,
    color: '#333',
  },
  editText: {
    color: '#007AFF',
    fontSize: 14,
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
  genderOptions: {
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
  modalButtons: {
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