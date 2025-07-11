import { View, Text, TouchableOpacity } from 'react-native';
import { processSubscription } from '../../api/payments';

export default function SubscribeScreen() {
  const handleSubscribe = async () => {
    try {
      await processSubscription(); // Your payment API call
      alert('Subscription successful!');
      navigation.goBack();
    } catch (error) {
      alert('Subscription failed: ' + error.message);
    }
  };

  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text style={{ fontSize: 20, marginBottom: 20 }}>Subscribe for KES 10</Text>
      <Text style={{ marginBottom: 30 }}>Get 24 hours of unlimited:</Text>
      <Text>- Photo uploads</Text>
      <Text>- View all photos</Text>
      <Text>- Messaging</Text>
      
      <TouchableOpacity 
        onPress={handleSubscribe}
        style={{ 
          backgroundColor: '#4CAF50', 
          padding: 15, 
          borderRadius: 5, 
          marginTop: 30 
        }}
      >
        <Text style={{ color: 'white', fontSize: 18 }}>Subscribe Now</Text>
      </TouchableOpacity>
    </View>
  );
}