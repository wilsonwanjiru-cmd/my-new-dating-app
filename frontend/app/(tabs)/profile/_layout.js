import { createStackNavigator } from "@react-navigation/stack";
import React from "react";
import ProfileScreen from "./index"; // Import the ProfileScreen component

const Stack = createStackNavigator();

export default function ProfileLayout() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="UserProfile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}