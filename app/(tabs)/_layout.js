// app/(tabs)/_layout.js
import { Tabs } from 'expo-router';
import { AntDesign, Ionicons } from '@expo/vector-icons';
import { MaterialCommunityIcons } from '@expo/vector-icons';

export default function Layout() {
  return (
    <Tabs>
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profiles",
          tabBarIcon: ({ focused }) =>
            focused ? (
              <AntDesign name="eye" size={24} color="black" />
            ) : (
              <AntDesign name="eye" size={24} color="grey" />
            ),
        }}
      />
      <Tabs.Screen
        name="chat"
        options={{
          title: "Chat",
          tabBarIcon: ({ focused }) =>
            focused ? (
              <Ionicons name="chatbubble-ellipses" size={24} color="black" />
            ) : (
              <Ionicons name="chatbubble-ellipses" size={24} color="grey" />
            ),
        }}
      />
      <Tabs.Screen
        name="bio"
        options={{
          title: "Account",
          tabBarIcon: ({ focused }) =>
            focused ? (
              <MaterialCommunityIcons name="face-mask-outline" size={24} color="black" />
            ) : (
              <MaterialCommunityIcons name="face-mask-outline" size={24} color="grey" />
            ),
        }}
      />
    </Tabs>
  );
}

