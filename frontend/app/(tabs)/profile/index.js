// app/(tabs)/profile/index.js
import { useState, useEffect } from 'react';
import { View, Text, Image, FlatList, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useAuth } from '../../context/AuthContext';
import AsyncStorage from '@react-native-async-storage/async-storage';
import axios from 'axios';
import Constants from 'expo-constants';
import SubscribeOverlay from '../../../components/SubscribeOverlay';

const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || "https://dating-app-3eba.onrender.com";

export default function ProfileScreen({ route }) {
  const { user: profileUser } = route.params; // User data passed from navigation
  const { user: currentUser, isSubscribed } = useAuth();
  const [showSubscribeModal, setShowSubscribeModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [profileData, setProfileData] = useState(null);
  const [visiblePhotos, setVisiblePhotos] = useState([]);

  useEffect(() => {
    const fetchProfileData = async () => {
      try {
        const token = await AsyncStorage.getItem('auth');
        const response = await axios.get(`${API_BASE_URL}/api/users/${profileUser._id}`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        
        setProfileData(response.data);
        setVisiblePhotos(
          isSubscribed 
            ? response.data.profileImages 
            : response.data.profileImages.slice(0, 7)
        );
      } catch (error) {
        console.error('Error fetching profile:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [profileUser._id, isSubscribed]);

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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.name}>{profileData.name}</Text>
        <Text style={styles.age}>{profileData.age || ''}</Text>
      </View>

      <Text style={styles.description}>{profileData.description || 'No description yet'}</Text>

      {/* Photo Gallery */}
      <View style={styles.photosContainer}>
        <Text style={styles.sectionTitle}>Photos</Text>
        <FlatList
          data={visiblePhotos}
          numColumns={3}
          keyExtractor={(item, index) => index.toString()}
          renderItem={({ item }) => (
            <Image 
              source={{ uri: item }} 
              style={styles.photo}
              resizeMode="cover"
            />
          )}
          ListFooterComponent={
            !isSubscribed && profileData.profileImages.length > 7 && (
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
      <TouchableOpacity style={styles.likeButton}>
        <Text style={styles.likeButtonText}>Like</Text>
      </TouchableOpacity>

      {/* Subscription Modal */}
      <SubscribeOverlay
        visible={showSubscribeModal}
        message={`Subscribe to view all ${profileData.profileImages.length} photos`}
        onSubscribe={() => {
          setShowSubscribeModal(false);
          // Navigate to subscription screen
          navigation.navigate('Subscribe');
        }}
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
});