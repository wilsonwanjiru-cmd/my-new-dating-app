import { createContext, useContext, useState, useEffect } from 'react';
import { checkSubscriptionStatus } from '../api/auth';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isSubscribed, setIsSubscribed] = useState(false);
  
  // Check subscription status on load
  useEffect(() => {
    const checkSubscription = async () => {
      if (user) {
        const status = await checkSubscriptionStatus(user.id);
        setIsSubscribed(status);
      }
    };
    checkSubscription();
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, setUser, isSubscribed }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}