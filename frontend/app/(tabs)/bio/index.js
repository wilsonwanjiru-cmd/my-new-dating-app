// app/(tabs)/bio/index.js
// app/(tabs)/bio/index.js
import React, { useState, useEffect, useCallback, useContext } from "react";
import {
  StyleSheet,
  Text,
  View,
  Image,
  Pressable,
  Alert,
  ActivityIndicator,
  TouchableOpacity,
  RefreshControl,
  FlatList
} from "react-native";
import { Entypo, AntDesign, MaterialIcons } from "@expo/vector-icons";
import { useAuth } from "../../../src/_context/AuthContext";
import { useRouter } from "expo-router";
import { useSocket } from "../../../src/_context/SocketContext";
import { likePhoto, getFeedPhotos } from "../../../src/_api/photos";

const BioScreen = () => {
  const router = useRouter();
  const { user, isSubscribed, startChat } = useAuth();
  const { onlineUsers } = useSocket();
  
  const [photos, setPhotos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  // Fetch photos based on gender preference
  const fetchPhotos = useCallback(async (pageNum = 1) => {
    try {
      if (!user?.gender) return;
      
      setLoading(true);
      const oppositeGender = user.gender === "male" ? "female" : "male";
      const response = await getFeedPhotos(oppositeGender);
      
      if (pageNum === 1) {
        setPhotos(response.data);
      } else {
        setPhotos(prev => [...prev, ...response.data]);
      }
      
      setHasMore(response.data.length > 0);
      setPage(pageNum);
    } catch (error) {
      console.error("Error fetching photos:", error);
      Alert.alert("Error", "Failed to load photos. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.gender]);

  // Initial load
  useEffect(() => {
    fetchPhotos();
  }, [fetchPhotos]);

  // Refresh control
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    fetchPhotos(1);
  }, [fetchPhotos]);

  // Load more photos
  const loadMorePhotos = () => {
    if (!loading && hasMore) {
      fetchPhotos(page + 1);
    }
  };

  // Handle photo like with optimistic updates
  const handleLike = async (photoId, currentIsLiked) => {
    try {
      // Optimistic UI update
      setPhotos(prev => prev.map(photo => 
        photo._id === photoId 
          ? { 
              ...photo, 
              likes: currentIsLiked ? photo.likes - 1 : photo.likes + 1, 
              isLiked: !currentIsLiked 
            } 
          : photo
      ));

      // Actual API call
      const result = await likePhoto(photoId, !currentIsLiked);
      
      // Sync with server response
      setPhotos(prev => prev.map(photo => 
        photo._id === photoId 
          ? { 
              ...photo, 
              likes: result.data.likes, 
              isLiked: result.data.isLiked 
            } 
          : photo
      ));
    } catch (error) {
      // Revert on error
      setPhotos(prev => prev.map(photo => 
        photo._id === photoId 
          ? { 
              ...photo, 
              likes: currentIsLiked ? photo.likes + 1 : photo.likes - 1, 
              isLiked: currentIsLiked 
            } 
          : photo
      ));
      Alert.alert("Error", "Failed to update like. Please try again.");
    }
  };

  // Handle chat initiation
  const handleChat = async (userId) => {
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
    
    try {
      const result = await startChat(userId);
      if (result.success) {
        router.push(`/chat/${result.chatId}`);
      }
    } catch (error) {
      console.error("Error starting chat:", error);
    }
  };

  // Render photo card with like functionality
  const renderPhotoCard = ({ item }) => {
    const isOnline = onlineUsers.includes(item.userId);
    const isCurrentUser = user?._id === item.userId;

    return (
      <View style={styles.photoCard} key={item._id}>
        {/* User info header */}
        <View style={styles.userHeader}>
          <View style={styles.userInfo}>
            <View style={{ position: 'relative' }}>
              <Image
                style={styles.userAvatar}
                source={{ uri: item.user?.profileImages?.[0]?.url || "https://via.placeholder.com/100" }}
              />
              {isOnline && !isCurrentUser && <View style={styles.onlineIndicator} />}
            </View>
            <View>
              <Text style={styles.userName}>{item.user?.name || "User"}</Text>
              <Text style={styles.userAge}>{item.user?.age || ''} years</Text>
            </View>
          </View>
          
          {!isCurrentUser && (
            <TouchableOpacity onPress={() => handleChat(item.userId)}>
              <MaterialIcons name="chat" size={24} color="#FF1493" />
            </TouchableOpacity>
          )}
        </View>
        
        {/* Photo */}
        <Image
          style={styles.photoImage}
          source={{ uri: item.url }}
        />
        
        {/* Photo actions */}
        <View style={styles.photoActions}>
          <TouchableOpacity 
            style={styles.likeButton}
            onPress={() => handleLike(item._id, item.isLiked)}
          >
            <AntDesign 
              name={item.isLiked ? "heart" : "hearto"} 
              size={24} 
              color={item.isLiked ? "#FF1493" : "#444"} 
            />
            <Text style={[styles.likeCount, item.isLiked && styles.likedCount]}>
              {item.likes || 0}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Discover</Text>
        <TouchableOpacity onPress={() => router.push("/(tabs)/profile")}>
          <Image
            style={styles.profileImage}
            source={{ 
              uri: user?.profileImages?.[0]?.url || "https://via.placeholder.com/100" 
            }}
          />
        </TouchableOpacity>
      </View>

      {/* Photo Feed */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#FF1493" />
        </View>
      ) : photos.length > 0 ? (
        <FlatList
          data={photos}
          renderItem={renderPhotoCard}
          keyExtractor={item => item._id}
          contentContainerStyle={styles.photoFeed}
          onEndReached={loadMorePhotos}
          onEndReachedThreshold={0.5}
          refreshing={refreshing}
          onRefresh={onRefresh}
          refreshControl={
            <RefreshControl 
              refreshing={refreshing} 
              onRefresh={onRefresh}
              tintColor="#FF1493"
            />
          }
          ListFooterComponent={
            hasMore ? (
              <Pressable 
                style={styles.loadMoreButton} 
                onPress={loadMorePhotos}
                disabled={loading}
              >
                <Text style={styles.loadMoreText}>Load More Photos</Text>
              </Pressable>
            ) : null
          }
        />
      ) : (
        <View style={styles.emptyState}>
          <Image
            style={styles.emptyImage}
            source={{ uri: "https://cdn-icons-png.flaticon.com/128/776/776528.png" }}
          />
          <Text style={styles.emptyTitle}>No Photos Available</Text>
          <Text style={styles.emptyText}>
            {user?.gender === "male" 
              ? "There are currently no female users with photos" 
              : "There are currently no male users with photos"}
          </Text>
        </View>
      )}

      {/* Upload Button */}
      <TouchableOpacity
        style={styles.uploadButton}
        onPress={() => router.push("/upload-photo")}
      >
        <Entypo name="camera" size={24} color="white" />
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: 'white',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FF1493',
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FF69B4',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 50,
  },
  photoFeed: {
    padding: 15,
  },
  photoCard: {
    backgroundColor: 'white',
    borderRadius: 15,
    marginBottom: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  userHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#FFF5F7',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  userAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#FFD1DC',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 5,
    right: 5,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#4CAF50',
    borderWidth: 2,
    borderColor: 'white',
  },
  userName: {
    fontSize: 16,
    fontWeight: '600',
  },
  userAge: {
    fontSize: 14,
    color: '#777',
  },
  photoImage: {
    width: '100%',
    aspectRatio: 0.75,
    backgroundColor: '#f0f0f0',
  },
  photoActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 15,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: '#FFF0F5',
    borderRadius: 20,
  },
  likeCount: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '600',
    color: '#444',
  },
  likedCount: {
    color: '#FF1493',
  },
  loadMoreButton: {
    backgroundColor: '#FF1493',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  loadMoreText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  emptyImage: {
    width: 120,
    height: 120,
    marginBottom: 20,
    opacity: 0.7,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 10,
    color: '#444',
  },
  emptyText: {
    fontSize: 16,
    color: '#777',
    textAlign: 'center',
    lineHeight: 24,
  },
  uploadButton: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FF1493',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.3,
    shadowRadius: 5,
    elevation: 8,
  },
});

export default BioScreen;