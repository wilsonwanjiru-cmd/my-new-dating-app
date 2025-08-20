// app/subscribe.js
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  ScrollView,
  Alert,
} from 'react-native';
import { useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { activateSubscription, checkSubscriptionStatus } from '../src/_api/subscriptions';

const SubscriptionScreen = () => {
  const navigation = useNavigation();
  const [phoneNumber, setPhoneNumber] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [subscriptionData, setSubscriptionData] = useState(null);
  const [mpesaCode, setMpesaCode] = useState('');

  // Load current subscription status
  useEffect(() => {
    const fetchStatus = async () => {
      setIsLoading(true);
      try {
        const status = await checkSubscriptionStatus();
        setSubscriptionData(status);
      } catch (error) {
        Alert.alert('Error', 'Failed to load subscription status');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchStatus();
  }, []);

  const handleSubscribe = async () => {
    if (!phoneNumber.match(/^07[0-9]{8}$/)) {
      Alert.alert('Invalid Number', 'Please enter a valid Kenyan phone number (07XXXXXXXX)');
      return;
    }

    setIsLoading(true);
    try {
      const result = await activateSubscription(phoneNumber);
      
      if (result.success) {
        Alert.alert(
          'Payment Request Sent',
          `An M-Pesa payment request has been sent to ${phoneNumber}. ` +
          'Please complete the payment to activate your subscription.'
        );
        setMpesaCode(result.mpesaCode || '');
      } else {
        Alert.alert('Payment Failed', result.message || 'Failed to initiate payment');
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to process subscription');
    } finally {
      setIsLoading(false);
    }
  };

  const formatExpiry = (date) => {
    if (!date) return 'Not active';
    return new Date(date).toLocaleString('en-KE', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Premium Subscription</Text>
      
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Ruda Dating Premium</Text>
        <View style={styles.featureList}>
          <Text style={styles.feature}>✓ Send and receive unlimited messages</Text>
          <Text style={styles.feature}>✓ View all photos in profiles</Text>
          <Text style={styles.feature}>✓ See who liked your photos</Text>
          <Text style={styles.feature}>✓ Priority in search results</Text>
        </View>
        
        <View style={styles.priceContainer}>
          <Text style={styles.price}>KES 10</Text>
          <Text style={styles.duration}>/ 24 hours</Text>
        </View>
      </View>
      
      {subscriptionData && (
        <View style={styles.statusCard}>
          <Text style={styles.statusTitle}>Current Status</Text>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status:</Text>
            <Text style={[
              styles.statusValue,
              subscriptionData.isSubscribed ? styles.active : styles.inactive
            ]}>
              {subscriptionData.isSubscribed ? 'Active' : 'Inactive'}
            </Text>
          </View>
          
          {subscriptionData.expiresAt && (
            <View style={styles.statusRow}>
              <Text style={styles.statusLabel}>Expires:</Text>
              <Text style={styles.statusValue}>
                {formatExpiry(subscriptionData.expiresAt)}
              </Text>
            </View>
          )}
        </View>
      )}
      
      <Text style={styles.inputLabel}>Enter your M-Pesa phone number:</Text>
      <TextInput
        style={styles.input}
        placeholder="07XXXXXXXX"
        keyboardType="phone-pad"
        value={phoneNumber}
        onChangeText={setPhoneNumber}
        maxLength={10}
      />
      
      <Pressable
        style={styles.button}
        onPress={handleSubscribe}
        disabled={isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Subscribe Now (KES 10)</Text>
        )}
      </Pressable>
      
      {mpesaCode && (
        <View style={styles.mpesaNote}>
          <Text style={styles.noteTitle}>Payment Instructions:</Text>
          <Text style={styles.noteText}>
            1. Check your phone for M-Pesa prompt
          </Text>
          <Text style={styles.noteText}>
            2. Enter your M-Pesa PIN when prompted
          </Text>
          <Text style={styles.noteText}>
            3. Your subscription will activate immediately
          </Text>
          <Text style={[styles.noteText, styles.code]}>
            Transaction Code: {mpesaCode}
          </Text>
        </View>
      )}
      
      <Text style={styles.footerNote}>
        Your subscription will automatically renew every 24 hours until canceled.
        You can cancel anytime from your M-Pesa menu.
      </Text>
    </ScrollView>
  );
};

export default SubscriptionScreen;

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#F8F9FA',
  },
  title: {
    fontSize: 26,
    fontWeight: 'bold',
    color: '#5D3FD3',
    textAlign: 'center',
    marginBottom: 25,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  cardTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
    textAlign: 'center',
  },
  featureList: {
    marginBottom: 20,
  },
  feature: {
    fontSize: 16,
    color: '#444',
    marginBottom: 8,
  },
  priceContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'baseline',
    marginTop: 10,
  },
  price: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#5D3FD3',
  },
  duration: {
    fontSize: 16,
    color: '#666',
    marginLeft: 5,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 25,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  statusTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  statusLabel: {
    fontSize: 16,
    color: '#666',
  },
  statusValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  active: {
    color: '#4CAF50',
  },
  inactive: {
    color: '#F44336',
  },
  inputLabel: {
    fontSize: 16,
    color: '#444',
    marginBottom: 8,
    fontWeight: '500',
  },
  input: {
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#DDD',
    borderRadius: 10,
    paddingHorizontal: 15,
    fontSize: 16,
    marginBottom: 25,
  },
  button: {
    backgroundColor: '#5D3FD3',
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: 'bold',
  },
  mpesaNote: {
    backgroundColor: '#E3F2FD',
    borderRadius: 10,
    padding: 15,
    marginBottom: 20,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1976D2',
    marginBottom: 10,
  },
  noteText: {
    fontSize: 14,
    color: '#333',
    marginBottom: 5,
  },
  code: {
    fontWeight: 'bold',
    marginTop: 10,
    color: '#5D3FD3',
  },
  footerNote: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});