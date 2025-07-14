// app/(tabs)/profile/index.js
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
  Alert
} from 'react-native';
import { useAuth } from '../../_context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import { useNavigation } from 'expo-router';
import SubscribeOverlay from '../../../components/SubscribeOverlay';

const API_BASE_URL =
  Constants.expoConfig?.extra?.apiBaseUrl || 'https://dating-app-3eba.onrender.com';

export default function ProfileScreen({ route }) {
  const navigation = useNavigation();
  const { user: routeUser } = route?.params || {}; // selected profile
  const { user: currentUser, isSubscribed, subscriptionExpiresAt } = useAuth();

  const profileUser = routeUser || currentUser; // fallback to self
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [visiblePhotos, setVisiblePhotos] = useState([]);

  const isExpired =
    subscriptionExpiresAt &&
    new Date(subscriptionExpiresAt).getTime() < new Date().getTime();

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

        const shouldLimit =
          !isSubscribed || isExpired || profileUser._id !== currentUser._id;

        setVisiblePhotos(
          shouldLimit ? response.data.profileImages.slice(0, 7) : response.data.profileImages
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{profileData.name}</Text>
        <Text style={styles.age}>{profileData.age ? `${profileData.age} years` : ''}</Text>
      </View>

      <Text style={styles.description}>{profileData.description || 'No description yet'}</Text>

      {/* Show Subscribe Button if viewing own profile and subscription expired */}
      {profileUser._id === currentUser._id && isExpired && (
        <TouchableOpacity style={styles.renewButton} onPress={handleSubscriptionPress}>
          <Text style={styles.renewButtonText}>Renew Subscription</Text>
        </TouchableOpacity>
      )}

      {/* Photo Gallery */}
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
            profileUser._id !== currentUser._id &&
            !isSubscribed &&
            profileData.profileImages.length > 7 && (
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

      {/* Like Button */}
      {profileUser._id !== currentUser._id && (
        <TouchableOpacity style={styles.likeButton}>
          <Text style={styles.likeButtonText}>Like</Text>
        </TouchableOpacity>
      )}

      {/* Subscription Modal */}
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
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    marginRight: 8,
  },
  age: {
    fontSize: 18,
    color: '#666',
  },
  description: {
    fontSize: 16,
    marginBottom: 24,
    color: '#444',
  },
  photosContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 12,
  },
  photo: {
    width: '32%',
    aspectRatio: 1,
    margin: '0.5%',
    borderRadius: 8,
  },
  subscribeButton: {
    backgroundColor: '#FF6B6B',
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
    alignItems: 'center',
  },
  subscribeButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
  likeButton: {
    backgroundColor: '#4CAF50',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  likeButtonText: {
    color: 'white',
    fontWeight: 'bold',
    fontSize: 16,
  },
  renewButton: {
    backgroundColor: '#FF6B6B',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
    alignItems: 'center',
  },
  renewButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
