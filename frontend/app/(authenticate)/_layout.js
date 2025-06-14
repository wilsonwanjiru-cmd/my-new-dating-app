import { createStackNavigator } from "@react-navigation/stack";
import React from "react";
import LoginScreen from "./login"; // Import the LoginScreen component
import RegisterScreen from "./register"; // Import the RegisterScreen component
import SelectScreen from "./select"; // Import the SelectScreen component

const Stack = createStackNavigator();

export default function AuthLayout() {
  return (
    <Stack.Navigator
      initialRouteName="Login" // Set the initial route to "Login"
      screenOptions={{ headerShown: false }} // Hide the header for all screens
    >
      {/* Login Screen */}
      <Stack.Screen
        name="Login"
        component={LoginScreen}
      />

      {/* Register Screen */}
      <Stack.Screen
        name="Register"
        component={RegisterScreen}
      />

      {/* Select Screen */}
      <Stack.Screen
        name="Select"
        component={SelectScreen}
      />
    </Stack.Navigator>
  );
}