// app/(authenticate)/verify.js

import { useLocalSearchParams, router } from 'expo-router';
import { View, Text, Button, Alert } from 'react-native';
import axios from 'axios';
import { useEffect } from 'react';

export default function Verify() {
  const { userId } = useLocalSearchParams();

  useEffect(() => {
    if (!userId) {
      Alert.alert("Missing userId", "Cannot proceed without a valid user ID.");
      router.replace('/(authenticate)/login');
    }
  }, [userId]);

  const resendVerification = async () => {
    try {
      const response = await axios.post(`https://api.rudadatingsite.singles/api/auth/resend`, { userId });
      Alert.alert("Success", "Verification email has been resent.");
    } catch (error) {
      console.error("Resend error:", error.response?.data || error.message);
      Alert.alert("Error", "Failed to resend verification email.");
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 20, marginBottom: 16, textAlign: 'center' }}>
        Your email is not verified.
      </Text>
      <Text style={{ fontSize: 16, marginBottom: 24, textAlign: 'center' }}>
        Please check your inbox or resend the verification link.
      </Text>
      <Button title="Resend Verification Email" onPress={resendVerification} />
      <View style={{ height: 20 }} />
      <Button title="Back to Login" color="gray" onPress={() => router.push('/(authenticate)/login')} />
    </View>
  );
}
