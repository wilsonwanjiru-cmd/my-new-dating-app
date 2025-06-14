import { createStackNavigator } from "@react-navigation/stack";
import React from "react";
import BioScreen from "./index"; // Import the BioScreen component

const Stack = createStackNavigator();

export default function BioLayout() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="MainBio" component={BioScreen} />
    </Stack.Navigator>
  );
}

