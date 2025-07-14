// frontend/app/_context/SubscriptionContext.js
import { createContext, useContext, useState, useEffect } from 'react';
import { checkSubscriptionStatus } from '../_api/subscriptions'; // ✅ Updated path
import { useAuth } from './AuthContext';

const SubscriptionContext = createContext();

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (user?._id) {
        try {
          const status = await checkSubscriptionStatus(user._id);
          setIsSubscribed(status);
        } catch (error) {
          console.error('Error checking subscription status:', error);
        }
      }
    };

    checkStatus();
    const interval = setInterval(checkStatus, 1000 * 60 * 5); // Check every 5 minutes

    return () => clearInterval(interval);
  }, [user?._id]);

  return (
    <SubscriptionContext.Provider value={{ isSubscribed, setIsSubscribed }}>
      {children}
    </SubscriptionContext.Provider>
  );
}

export function useSubscription() {
  return useContext(SubscriptionContext);
}
