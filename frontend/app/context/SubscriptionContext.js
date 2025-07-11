import { createContext, useContext, useState, useEffect } from 'react';
import { checkSubscriptionStatus } from '../api/subscriptions';
import { useAuth } from './AuthContext';

const SubscriptionContext = createContext();

export function SubscriptionProvider({ children }) {
  const { user } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      if (user?._id) {
        const status = await checkSubscriptionStatus(user._id);
        setIsSubscribed(status);
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