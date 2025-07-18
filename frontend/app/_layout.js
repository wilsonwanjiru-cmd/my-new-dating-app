// frontend/app/_layout.js
import { Slot } from 'expo-router';
import { AuthProvider } from './_context/AuthContext';
import { SubscriptionProvider } from './_context/SubscriptionContext';
import { SocketProvider } from './_context/SocketContext';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'react-native';
import Toast from 'react-native-toast-message';

// Create a query client for React Query
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes cache time
      retry: 2, // Retry failed queries twice
      refetchOnWindowFocus: false, // Disable refetch on window focus
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
                
                {/* Main app content */}
                <Slot />

                {/* Toast notifications */}
                <Toast />
              </SubscriptionProvider>
            </SocketProvider>
          </QueryClientProvider>
        </AuthProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}