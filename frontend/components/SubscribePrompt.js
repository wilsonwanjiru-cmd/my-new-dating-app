import { View, Text, TouchableOpacity } from 'react-native';

export default function SubscribePrompt({ onSubscribe }) {
  return (
    <View style={{ padding: 20, backgroundColor: '#FFF3CD', borderRadius: 5, margin: 10 }}>
      <Text style={{ marginBottom: 10 }}>Subscribe to send messages</Text>
      <TouchableOpacity 
        onPress={onSubscribe}
        style={{ backgroundColor: '#4CAF50', padding: 10, borderRadius: 5 }}
      >
        <Text style={{ color: 'white', textAlign: 'center' }}>Unlock Messaging</Text>
      </TouchableOpacity>
    </View>
  );
}