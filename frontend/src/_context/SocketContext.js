// src/_context/SocketContext.js
import React, { createContext, useContext, useState, useEffect } from 'react';
import { io } from 'socket.io-client';
import Constants from 'expo-constants';
import { useAuth } from './AuthContext';

const SocketContext = createContext();

export const SocketProvider = ({ children }) => {
  const [socket, setSocket] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const { user, token } = useAuth();
  
  const API_BASE_URL = Constants.expoConfig?.extra?.apiBaseUrl || "https://dating-app-3eba.onrender.com";

  useEffect(() => {
    // Only initialize socket if we have a user and token
    if (!user?._id || !token) {
      return;
    }

    try {
      // Initialize socket connection with authentication
      const newSocket = io(API_BASE_URL, {
        transports: ['websocket', 'polling'], // Add fallback transport
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        auth: {
          token: `Bearer ${token}`
        },
        query: {
          userId: user._id
        }
      });

      // Connection established
      newSocket.on('connect', () => {
        console.log('Socket connected:', newSocket.id);
        setIsConnected(true);
        
        // Emit user online status
        newSocket.emit('user-online', user._id);
      });

      // Handle online users list updates
      newSocket.on('online-users', (usersList) => {
        setOnlineUsers(usersList);
      });

      // Handle connection errors
      newSocket.on('connect_error', (err) => {
        console.log('Socket connection error:', err.message);
        setIsConnected(false);
      });

      // Handle reconnection events
      newSocket.on('reconnect', (attempt) => {
        console.log(`Reconnected after ${attempt} attempts`);
        setIsConnected(true);
        newSocket.emit('user-online', user._id);
      });

      // Handle disconnection
      newSocket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
        setIsConnected(false);
      });

      setSocket(newSocket);

      // Cleanup function
      return () => {
        if (newSocket) {
          newSocket.emit('user-offline', user._id);
          newSocket.disconnect();
        }
      };
    } catch (error) {
      console.error('Socket initialization error:', error);
      setIsConnected(false);
    }
  }, [user, token]);

  // Context value
  const value = {
    socket,
    onlineUsers,
    isConnected
  };

  return (
    <SocketContext.Provider value={value}>
      {children}
    </SocketContext.Provider>
  );
};

export const useSocket = () => {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error('useSocket must be used within a SocketProvider');
  }
  return context;
};

// Default export for compatibility
export default SocketContext;