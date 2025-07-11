import { View, Text, TouchableOpacity, Modal } from 'react-native';

export default function SubscribeOverlay({ message, onSubscribe }) {
  return (
    <Modal transparent={true} animationType="slide">
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
        <View style={{ backgroundColor: 'white', padding: 20, borderRadius: 10 }}>
          <Text style={{ fontSize: 18, marginBottom: 20 }}>{message}</Text>
          <TouchableOpacity 
            onPress={onSubscribe}
            style={{ backgroundColor: '#FF6B6B', padding: 10, borderRadius: 5 }}
          >
            <Text style={{ color: 'white', textAlign: 'center' }}>Subscribe for KES 10</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}