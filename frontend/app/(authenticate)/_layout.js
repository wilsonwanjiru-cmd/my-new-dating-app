import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack>
      {/* Login Screen */}
      <Stack.Screen
        name="login"  // Note: lowercase for file-based routing
        options={{
          title: 'Login',
          headerShown: false
        }}
      />

      {/* Register Screen */}
      <Stack.Screen
        name="register"  // Note: lowercase for file-based routing
        options={{
          title: 'Register',
          headerShown: false
        }}
      />

      {/* Select Screen */}
      <Stack.Screen
        name="select"  // Note: lowercase for file-based routing
        options={{
          title: 'Select',
          headerShown: false
        }}
      />
    </Stack>
  );
}