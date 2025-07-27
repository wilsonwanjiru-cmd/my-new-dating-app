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
} from 'react-native';
import { useAuth } from '../../_context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import { useNavigation } from 'expo-router';
import SubscribeOverlay from '../../../components/SubscribeOverlay';
import { updateUserGender } from '../../_api/users';

const MAX_RETRIES = 3;
const RETRY_DELAY_BASE = 1000;

export default function ProfileScreen({ route }) {
  const navigation = useNavigation();
  const { user: routeUser } = route?.params || {};
  const {
    user: currentUser,
    isSubscribed,
    subscriptionExpiresAt,
    updateUser,
    incrementPhotoView,
    canViewMorePhotos,
    getRemainingPhotoViews
  } = useAuth();

  const profileUser = routeUser || currentUser;
  const isOwnProfile = profileUser._id === currentUser._id;

  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [visiblePhotos, setVisiblePhotos] = useState([]);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [selectedGender, setSelectedGender] = useState('');
  const [updatingGender, setUpdatingGender] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [lastError, setLastError] = useState(null);

  const isExpired = subscriptionExpiresAt && new Date(subscriptionExpiresAt) < new Date();

  const fetchUserProfile = async () => {
    try {
      setLoading(true);
      setLastError(null);
      
      // Get the target user ID (either from route params or current user)
      const targetUserId = routeUser?._id || currentUser?._id;
      
      if (!targetUserId) {
        throw new Error('User identification unavailable');
      }

      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('Authentication token missing');
      }

      const response = await axios.get(
        `${process.env.EXPO_PUBLIC_API_BASE_URL}/api/users/${targetUserId}`,
        {
          headers: { Authorization: `Bearer ${token}` },
          timeout: 8000,
          validateStatus: (status) => status < 500 // Don't throw for 404
        }
      );

      // Handle 404 specifically
      if (response.status === 404) {
        throw new Error('User profile not found');
      }

      if (!response.data) {
        throw new Error('Invalid profile data received');
      }

      const data = response.data;
      setProfileData(data);
      setSelectedGender(data.gender || '');

      // Handle photo visibility based on subscription status
      let photosToShow = data.profileImages || [];
      if (!isSubscribed || isExpired || !isOwnProfile) {
        const remainingViews = isOwnProfile ? Infinity : getRemainingPhotoViews();
        photosToShow = photosToShow.slice(0, remainingViews);
      }

      setVisiblePhotos(photosToShow);
      setRetryCount(0);
    } catch (error) {
      console.error('Profile fetch error:', {
        message: error.message,
        code: error.code,
        status: error.response?.status,
        url: error.config?.url
      });
      setLastError(error);

      // Don't retry for 404 errors
      if (error.message === 'User profile not found') {
        Alert.alert('Error', 'The requested profile could not be found');
        return;
      }

      if ((error.code === 'ECONNABORTED' || 
           error.message.includes('Network Error') || 
           error.response?.status >= 500) &&
          retryCount < MAX_RETRIES) {
        const delay = RETRY_DELAY_BASE * Math.pow(2, retryCount);
        setTimeout(() => {
          setRetryCount(c => c + 1);
          fetchUserProfile();
        }, delay);
        return;
      }

      Alert.alert(
        'Error',
        error.response?.status === 502
          ? 'Our servers are temporarily unavailable. Please try again later.'
          : error.message || 'Unable to fetch profile data.'
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchUserProfile();
    });
    return unsubscribe;
  }, [navigation, profileUser?._id, isSubscribed, isExpired]);

  const handleGenderUpdate = async () => {
    if (!selectedGender || selectedGender === profileData?.gender) {
      setShowGenderModal(false);
      return;
    }

    try {
      setUpdatingGender(true);
      const token = await AsyncStorage.getItem('authToken');
      if (!token) throw new Error('Authentication token missing');

      await updateUserGender(currentUser._id, selectedGender, token);

      setProfileData(prev => ({ ...prev, gender: selectedGender }));
      updateUser({ ...currentUser, gender: selectedGender });
      Alert.alert('Success', 'Gender updated successfully');
      setShowGenderModal(false);
    } catch (error) {
      console.error('Gender update error:', error);
      Alert.alert('Error', error.response?.data?.message || 'Failed to update gender');
    } finally {
      setUpdatingGender(false);
    }
  };

  const handleRetry = () => {
    setRetryCount(0);
    fetchUserProfile();
  };

  const handleSubscriptionPress = () => {
    setShowSubscribeModal(false);
    navigation.navigate('subscribe');
  };

  const handlePhotoPress = async (index) => {
    if (!isOwnProfile && !canViewMorePhotos()) {
      setShowSubscribeModal(true);
      return;
    }

    if (!isOwnProfile) {
      await incrementPhotoView();
    }
  };

  if (!profileUser?._id) {
    return (
      <View style={styles.centered}>
        <Text>No profile selected.</Text>
      </View>
    );
  }

  if (loading && retryCount === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
        {retryCount > 0 && (
          <Text style={styles.retryStatusText}>
            Attempt {retryCount + 1} of {MAX_RETRIES + 1}
          </Text>
        )}
      </View>
    );
  }

  if (!profileData && lastError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorText}>
          {lastError.response?.status === 502
            ? 'Server temporarily unavailable'
            : lastError.message || 'Failed to load profile'}
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>
            {retryCount > 0 ? `Retrying... (${retryCount}/${MAX_RETRIES})` : 'Retry Now'}
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{profileData?.name || 'User'}</Text>
        <Text style={styles.age}>{profileData?.age ? `${profileData.age} years` : ''}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Gender</Text>
        {isOwnProfile ? (
          <TouchableOpacity onPress={() => setShowGenderModal(true)} style={styles.editField}>
            <Text style={styles.fieldValue}>
              {profileData?.gender || 'Not specified'}
              <Text style={styles.editText}> (Edit)</Text>
            </Text>
          </TouchableOpacity>
        ) : (
          <Text style={styles.fieldValue}>{profileData?.gender || 'Not specified'}</Text>
        )}
      </View>

      <Text style={styles.description}>{profileData?.description || 'No description yet'}</Text>

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
          renderItem={({ item, index }) => (
            <TouchableOpacity onPress={() => handlePhotoPress(index)}>
              <Image source={{ uri: item }} style={styles.photo} resizeMode="cover" />
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <Text style={styles.noPhotosText}>No photos available</Text>
          }
          ListFooterComponent={
            !isOwnProfile && !isSubscribed && profileData?.profileImages?.length > visiblePhotos.length && (
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
                  <Text style={[
                    styles.genderOptionText,
                    selectedGender === gender && styles.selectedGenderOptionText
                  ]}>
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
        message={`Subscribe to view all ${profileData?.profileImages?.length || 0} photos`}
        onSubscribe={handleSubscriptionPress}
        onClose={() => setShowSubscribeModal(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    color: '#ff4444',
    marginBottom: 16,
    textAlign: 'center',
  },
  retryStatusText: {
    marginTop: 10,
    color: '#666',
    fontSize: 14,
  },
  header: {
    marginBottom: 20,
    alignItems: 'center',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  age: {
    fontSize: 16,
    color: '#666',
  },
  section: {
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
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
  description: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 20,
    color: '#333',
  },
  photosContainer: {
    flex: 1,
    marginBottom: 20,
  },
  photo: {
    width: '32%',
    aspectRatio: 1,
    margin: '0.5%',
    borderRadius: 8,
  },
  noPhotosText: {
    textAlign: 'center',
    marginTop: 20,
    color: '#888',
  },
  subscribeButton: {
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    marginTop: 16,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  likeButton: {
    padding: 16,
    backgroundColor: '#FF4081',
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  likeButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
  },
  renewButton: {
    padding: 12,
    backgroundColor: '#4CAF50',
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  renewButtonText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  retryButton: {
    marginTop: 16,
    padding: 12,
    backgroundColor: '#007AFF',
    borderRadius: 8,
    minWidth: 150,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#fff',
    fontWeight: 'bold',
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