import { createStackNavigator } from "@react-navigation/stack";
import React from "react";
import ChatScreen from "./index"; // Import the ChatScreen component
import SelectScreen from "./select"; // Import the SelectScreen component
import ChatroomScreen from "./chatroom"; // Import the ChatroomScreen component

const Stack = createStackNavigator();

export default function ChatLayout() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="ChatHome" component={ChatScreen} />
      <Stack.Screen name="ChatSelect" component={SelectScreen} />
      <Stack.Screen name="ChatRoom" component={ChatroomScreen} />
    </Stack.Navigator>
  );
}
