// app/(tabs)/_layout.js
import { Tabs } from 'expo-router';
import { Feather, Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { View } from 'react-native';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: 'black',
        tabBarInactiveTintColor: 'gray',
        tabBarStyle: {
          backgroundColor: 'white',
          borderTopWidth: 0,
          elevation: 0,
        },
      }}
    >
      {/* Profile Tab */}
      <Tabs.Screen
        name="profile" // Matches the folder name
        options={{
          title: 'Profiles',
          tabBarIcon: ({ focused, color }) => (
            <Feather name="eye" size={24} color={color} />
          ),
        }}
      />

      {/* Chat Tab */}
      <Tabs.Screen
        name="chat" // Matches the folder name
        options={{
          title: 'Chat',
          tabBarIcon: ({ focused, color }) => (
            <Ionicons 
              name="chatbubble-ellipses-outline" 
              size={24} 
              color={color} 
            />
          ),
        }}
      />

      {/* Bio Tab */}
      <Tabs.Screen
        name="bio" // Matches the folder name
        options={{
          title: 'Account',
          tabBarIcon: ({ focused, color }) => (
            <MaterialCommunityIcons 
              name="guy-fawkes-mask" 
              size={24} 
              color={color} 
            />
          ),
        }}
      />
    </Tabs>
  );
}