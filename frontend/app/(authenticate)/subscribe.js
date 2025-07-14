import React, { useContext } from 'react';
import { View, Text, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { makePayment } from '../_api/payments'; // ✅ Corrected relative path
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthContext } from '../_context/AuthContext'; // ✅ Corrected path

export default function SubscribeScreen() {
  const router = useRouter();
  const {
    user,
    setUser,
    setIsSubscribed,
    setSubscriptionExpiresAt
  } = useContext(AuthContext);

  const handleSubscribe = async () => {
    try {
      if (!user?._id) {
        Alert.alert("Error", "User not found. Please log in again.");
        return;
      }

      // 💳 Make the payment
      const result = await makePayment(user._id);

      const { isSubscribed, subscriptionExpiresAt } = result;

      if (!isSubscribed) {
        throw new Error("Subscription failed after payment.");
      }

      // ✅ Update context state
      setIsSubscribed(true);
      setSubscriptionExpiresAt(subscriptionExpiresAt);

      // ✅ Update local user object
      const updatedUser = {
        ...user,
        isSubscribed,
        subscriptionExpiresAt,
      };
      setUser(updatedUser);

      // ✅ Sync to AsyncStorage
      await AsyncStorage.setItem("user", JSON.stringify(updatedUser));

      Alert.alert("Success", "Subscription successful!");
      router.replace("/(tabs)/chat"); // ✅ Redirect to chat screen
    } catch (error) {
      console.error("Subscription error:", error);
      Alert.alert("Error", error.message || "Subscription failed. Please try again.");
    }
  };

  return (
    <View
      style={{
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 24,
        backgroundColor: 'white',
      }}
    >
      <Text style={{ fontSize: 22, fontWeight: 'bold', marginBottom: 12 }}>
        Subscribe for KES 10
      </Text>
      <Text style={{ fontSize: 16, textAlign: 'center', marginBottom: 24 }}>
        Get 24 hours of unlimited access to:
      </Text>

      <Text style={{ fontSize: 15, marginBottom: 6 }}>✓ Upload unlimited photos</Text>
      <Text style={{ fontSize: 15, marginBottom: 6 }}>✓ Send & receive messages</Text>
      <Text style={{ fontSize: 15, marginBottom: 24 }}>✓ View everyone’s full profile</Text>

      <TouchableOpacity
        onPress={handleSubscribe}
        style={{
          backgroundColor: '#4CAF50',
          paddingVertical: 12,
          paddingHorizontal: 32,
          borderRadius: 8,
          elevation: 2,
        }}
      >
        <Text style={{ color: 'white', fontSize: 18 }}>Subscribe Now</Text>
      </TouchableOpacity>
    </View>
  );
}
