// frontend/app/_api/photos.js
import client from './client';
import * as FileSystem from 'expo-file-system';
import { API_BASE_URL } from '../_config';

export const likePhoto = async (photoId, isLike) => {
  try {
    const response = await client.post(
      `/api/likes/photos/${photoId}`,
      { isLike }
    );
    return response.data;
  } catch (error) {
    console.error('Error liking photo:', error.response?.data || error.message);
    throw error;
  }
};

export const getFeedPhotos = async (gender) => {
  try {
    const response = await client.get(`/api/photos/feed?gender=${gender}`);
    return response.data;
  } catch (error) {
    console.error('Error fetching feed photos:', error.response?.data || error.message);
    throw error;
  }
};

export const uploadPhoto = async (imageUri) => {
  try {
    // Get file info
    const fileInfo = await FileSystem.getInfoAsync(imageUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    // Extract filename and extension
    const filename = imageUri.split('/').pop();
    const match = /\.(\w+)$/.exec(filename);
    const ext = match ? match[1] : 'jpg';
    const type = `image/${ext === 'png' ? 'png' : 'jpeg'}`;

    // Prepare form data
    const formData = new FormData();
    formData.append('photo', {
      uri: imageUri,
      name: `photo_${Date.now()}.${ext}`,
      type,
    });

    // Make API call using client
    const response = await client.post('/api/photos', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 30000, // 30 seconds timeout
    });

    return response.data;
  } catch (error) {
    console.error('Photo upload error:', {
      message: error.message,
      response: error.response?.data,
    });
    
    let errorMessage = 'Photo upload failed';
    if (error.response) {
      if (error.response.status === 413) {
        errorMessage = 'Image too large (max 5MB)';
      } else if (error.response.status === 415) {
        errorMessage = 'Unsupported image format (use JPEG or PNG)';
      } else if (error.response.data?.message) {
        errorMessage = error.response.data.message;
      }
    }
    
    throw new Error(errorMessage);
  }
};

export const getUserPhotos = async (userId) => {
  try {
    const response = await client.get(`/api/users/${userId}/photos`);
    return response.data;
  } catch (error) {
    console.error('Get photos error:', error.response?.data || error.message);
    throw error;
  }
};

export const deletePhoto = async (photoId) => {
  try {
    const response = await client.delete(`/api/photos/${photoId}`);
    return response.data;
  } catch (error) {
    console.error('Delete photo error:', error.response?.data || error.message);
    throw error;
  }
};

// Add other photo-related functions as needed
export const getPhotoDetails = async (photoId) => {
  try {
    const response = await client.get(`/api/photos/${photoId}`);
    return response.data;
  } catch (error) {
    console.error('Get photo details error:', error);
    throw error;
  }
};

export const reportPhoto = async (photoId, reason) => {
  try {
    const response = await client.post(`/api/photos/${photoId}/report`, { reason });
    return response.data;
  } catch (error) {
    console.error('Report photo error:', error);
    throw error;
  }
};