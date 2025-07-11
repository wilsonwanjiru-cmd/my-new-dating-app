import { Stack } from 'expo-router';
import { View, StatusBar } from 'react-native';
import { AuthProvider } from './context/AuthContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import Toast from 'react-native-toast-message';
import { SubscriptionProvider } from './context/SubscriptionContext';
import { SocketProvider } from './context/SocketContext';

// Create a client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      retry: 2, // Retry failed queries twice
    },
  },
});

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AuthProvider>
          <QueryClientProvider client={queryClient}>
            <SocketProvider>
              <SubscriptionProvider>
                <StatusBar 
                  barStyle="dark-content" 
                  backgroundColor="transparent" 
                  translucent 
                />
                <View style={{ flex: 1 }}>
                  <Stack
                    screenOptions={{
                      animation: 'fade',
                      fullScreenGestureEnabled: true,
                    }}
                  >
                    <Stack.Screen 
                      name="(authenticate)" 
                      options={{ 
                        headerShown: false,
                        gestureEnabled: false // Disable swipe back on auth screens
                      }} 
                    />
                    <Stack.Screen 
                      name="(tabs)" 
                      options={{ 
                        headerShown: false,
                        gestureEnabled: true
                      }} 
                    />
                    <Stack.Screen 
                      name="subscribe" 
                      options={{ 
                        title: 'Premium Subscription',
                        presentation: 'modal'
                      }} 
                    />
                  </Stack>
                </View>
                <Toast />
              </SubscriptionProvider>
            </SocketProvider>
          </QueryClientProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}