// app/(authenticate)/verify.js
import { useLocalSearchParams, router } from 'expo-router';
import { View, Text, Button, Alert, ActivityIndicator } from 'react-native';
import axios from 'axios';
import { useEffect, useState } from 'react';

export default function Verify() {
  const { token, email } = useLocalSearchParams();
  const [status, setStatus] = useState(token ? 'verifying' : 'unverified');
  const [isLoading, setIsLoading] = useState(false);

  // Handle email verification when token is present
  useEffect(() => {
    if (!token) return;

    const verifyEmail = async () => {
      try {
        const response = await axios.get(
          `https://api.rudadatingsite.singles/api/auth/verify`,
          { params: { token, email } }
        );

        if (response.data.success) {
          setStatus('verified');
          Alert.alert("Success", "Email verified successfully!");
          setTimeout(() => router.replace('/(authenticate)/login'), 2000);
        } else {
          setStatus('failed');
        }
      } catch (error) {
        console.error("Verification error:", error.response?.data || error.message);
        setStatus('error');
      }
    };

    verifyEmail();
  }, [token, email]);

  const resendVerification = async () => {
    setIsLoading(true);
    try {
      const response = await axios.post(
        `https://api.rudadatingsite.singles/api/auth/resend-verification`,
        { email }
      );

      Alert.alert("Success", response.data.message || "Verification email resent");
      setStatus('pending');
    } catch (error) {
      console.error("Resend error:", error.response?.data || error.message);
      Alert.alert("Error", error.response?.data?.message || "Failed to resend verification email");
    } finally {
      setIsLoading(false);
    }
  };

  // Verification in progress
  if (status === 'verifying') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
        <Text style={{ marginTop: 16 }}>Verifying your email...</Text>
      </View>
    );
  }

  // Already verified
  if (status === 'verified') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Text style={{ fontSize: 18, marginBottom: 16 }}>Email successfully verified!</Text>
        <Text>Redirecting to login...</Text>
      </View>
    );
  }

  // Verification failed states
  return (
    <View style={{ flex: 1, justifyContent: 'center', padding: 24 }}>
      <Text style={{ fontSize: 20, marginBottom: 16, textAlign: 'center' }}>
        {status === 'failed' 
          ? "Verification failed" 
          : "Email verification required"}
      </Text>
      
      <Text style={{ fontSize: 16, marginBottom: 24, textAlign: 'center' }}>
        {status === 'failed'
          ? "The verification link is invalid or expired."
          : "Please check your email for the verification link."}
      </Text>

      {isLoading ? (
        <ActivityIndicator size="large" />
      ) : (
        <Button 
          title="Resend Verification Email" 
          onPress={resendVerification} 
          disabled={isLoading}
        />
      )}

      <View style={{ height: 20 }} />
      
      <Button 
        title="Back to Login" 
        color="gray" 
        onPress={() => router.replace('/(authenticate)/login')} 
      />
    </View>
  );
}