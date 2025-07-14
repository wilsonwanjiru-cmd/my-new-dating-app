import { Stack } from 'expo-router';
import React from 'react';

export default function AuthLayout() {
  return (
    <Stack>
      {/* Login Screen */}
      <Stack.Screen
        name="login"
        options={{
          title: 'Login',
          headerShown: false,
        }}
      />

      {/* Register Screen */}
      <Stack.Screen
        name="register"
        options={{
          title: 'Register',
          headerShown: false,
        }}
      />

      {/* Select Screen */}
      <Stack.Screen
        name="select"
        options={{
          title: 'Select',
          headerShown: false,
        }}
      />

      {/* Subscribe Screen — ✅ Add this */}
      <Stack.Screen
        name="subscribe"
        options={{
          title: 'Subscribe',
          headerShown: true, // or false if you want to hide it
        }}
      />
    </Stack>
  );
}
