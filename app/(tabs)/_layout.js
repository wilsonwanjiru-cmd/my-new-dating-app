// app/(tabs)/_layout.js
import React from "react";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { Feather, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import ProfileLayout from "./profile/_layout"; // Import ProfileLayout
import ChatLayout from "./chat/_layout"; // Import ChatLayout
import BioLayout from "./bio/_layout"; // Import BioLayout

const Tab = createBottomTabNavigator();

export default function TabsLayout() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false, // Hide the header for all tabs
        tabBarActiveTintColor: "black", // Color for the active tab icon and label
        tabBarInactiveTintColor: "gray", // Color for the inactive tab icon and label
      }}
    >
      {/* Profile Tab */}
      <Tab.Screen
        name="UserProfileTab" // Renamed to avoid conflicts
        component={ProfileLayout} // Use ProfileLayout
        options={{
          title: "Profiles",
          tabBarIcon: ({ focused }) => (
            <Feather name="eye" size={24} color={focused ? "black" : "gray"} />
          ),
        }}
      />

      {/* Chat Tab */}
      <Tab.Screen
        name="UserChatTab" // Renamed to avoid conflicts
        component={ChatLayout} // Use ChatLayout
        options={{
          title: "Chat",
          tabBarIcon: ({ focused }) => (
            <Ionicons
              name="chatbubble-ellipses-outline"
              size={24}
              color={focused ? "black" : "gray"}
            />
          ),
        }}
      />

      {/* Bio Tab */}
      <Tab.Screen
        name="UserBioTab" // Renamed to avoid conflicts
        component={BioLayout} // Use BioLayout
        options={{
          title: "Account",
          tabBarIcon: ({ focused }) => (
            <MaterialCommunityIcons
              name="guy-fawkes-mask"
              size={24}
              color={focused ? "black" : "gray"}
            />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
