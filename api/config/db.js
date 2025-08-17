const mongoose = require('mongoose');
require('dotenv').config();

// Enhanced connection state tracking with dating-specific metrics
const connectionState = {
  isConnected: false,
  isConnecting: false,
  retryCount: 0,
  maxRetries: 5,
  lastActiveUsersCheck: null,
  onlineUsersCount: 0
};

// Dating-optimized connection options
const connectionOptions = {
  serverSelectionTimeoutMS: 5000,  // Faster failover for dating app responsiveness
  socketTimeoutMS: 30000,
  connectTimeoutMS: 8000,
  maxPoolSize: 100,               // Increased for high concurrency during peak dating hours
  minPoolSize: 10,
  heartbeatFrequencyMS: 5000,     // More frequent checks for online status accuracy
  retryWrites: true,
  w: 'majority',
  retryReads: true,
  readPreference: 'nearest',      // Better geo-distributed performance
  compressors: ['zlib']           // Reduce bandwidth for photo metadata
};

// Real-time connection analytics
const connectionAnalytics = {
  totalConnections: 0,
  failedConnections: 0,
  averageConnectionTime: 0
};

// Enhanced connection event handlers with dating-specific logging
const setupConnectionEvents = () => {
  mongoose.connection.on('connecting', () => {
    console.log('💑 [RudaDB] Connecting to MongoDB...');
    connectionState.isConnecting = true;
    connectionAnalytics.totalConnections++;
  });

  mongoose.connection.on('connected', () => {
    const now = Date.now();
    connectionState.isConnected = true;
    connectionState.isConnecting = false;
    connectionState.retryCount = 0;
    console.log('💘 [RudaDB] MongoDB connected successfully');
    console.log(`💌 Database: ${mongoose.connection.db.databaseName}`);
    console.log(`📍 Host: ${mongoose.connection.host}`);
    console.log(`🔢 Port: ${mongoose.connection.port}`);
    
    // Initialize online status tracking
    connectionState.lastActiveUsersCheck = now;
    updateOnlineUsersCount();
  });

  mongoose.connection.on('open', () => {
    console.log('🔓 [RudaDB] MongoDB connection is open for matches');
  });

  mongoose.connection.on('disconnecting', () => {
    console.log('👋 [RudaDB] MongoDB disconnecting...');
  });

  mongoose.connection.on('disconnected', () => {
    connectionState.isConnected = false;
    console.log('⚠️  [RudaDB] MongoDB disconnected - potential matches paused');
    attemptReconnection();
  });

  mongoose.connection.on('reconnected', () => {
    connectionState.isConnected = true;
    console.log('♻️  [RudaDB] MongoDB reconnected - matching resumed');
    updateOnlineUsersCount();
  });

  mongoose.connection.on('error', (err) => {
    connectionAnalytics.failedConnections++;
    console.error('❌ [RudaDB] Connection error:', err.message);
  });
};

// Dating-specific online users tracking
const updateOnlineUsersCount = async () => {
  if (!connectionState.isConnected) return;

  try {
    const threshold = new Date(Date.now() - 300000); // 5 minutes
    const count = await mongoose.connection.collection('users')
      .countDocuments({ lastActive: { $gte: threshold } });
    
    connectionState.onlineUsersCount = count;
    connectionState.lastActiveUsersCheck = Date.now();
    
    console.log(`👥 [RudaDB] Currently ${count} active daters online`);
  } catch (err) {
    console.error('⚠️  [RudaDB] Failed to update online users count:', err.message);
  }
  
  // Schedule next update (every 2 minutes)
  setTimeout(updateOnlineUsersCount, 120000);
};

// Automatic reconnection with dating-optimized backoff
const attemptReconnection = () => {
  if (connectionState.isConnecting || !process.env.MONGO_URI) return;

  if (connectionState.retryCount < connectionState.maxRetries) {
    const delay = Math.min(2000 * Math.pow(2, connectionState.retryCount), 20000);
    connectionState.retryCount++;
    
    console.log(`⏳ [RudaDB] Reconnection attempt ${connectionState.retryCount} in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        await mongoose.connect(process.env.MONGO_URI, connectionOptions);
      } catch (err) {
        console.error(`❌ [RudaDB] Reconnection failed:`, err.message);
        attemptReconnection();
      }
    }, delay);
  } else {
    console.error(`🚨 [RudaDB] Maximum reconnection attempts reached`);
    if (process.env.NODE_ENV === 'production') {
      // Implement your dating-specific alert system here
      process.exit(1);
    }
  }
};

// Dating-specific database indexes
const setupIndexes = async () => {
  try {
    console.log('🔍 [RudaDB] Setting up dating-optimized indexes...');
    
    // User indexes
    await mongoose.connection.collection('users').createIndexes([
      { key: { email: 1 }, unique: true, background: true },
      { key: { lastActive: -1 }, background: true },  // Critical for online status
      { key: { location: "2dsphere" }, background: true },  // Geo queries
      { key: { gender: 1, age: 1 }, background: true }  // Matching filters
    ]);
    
    // Photo indexes
    await mongoose.connection.collection('photos').createIndexes([
      { key: { userId: 1, timestamp: -1 }, background: true },
      { key: { likes: -1 }, background: true }  // Popular photos
    ]);
    
    // Chat indexes
    await mongoose.connection.collection('chats').createIndexes([
      { key: { participants: 1, lastMessageAt: -1 }, background: true },
      { key: { "messages.timestamp": -1 }, background: true }
    ]);

    // Online status index
    await mongoose.connection.collection('users').createIndex(
      { lastActive: -1 }, 
      { partialFilterExpression: { isOnline: true }, background: true }
    );

    console.log('✅ [RudaDB] Dating indexes ready for matching');
  } catch (err) {
    console.error('❌ [RudaDB] Failed to create indexes:', err.message);
    if (process.env.NODE_ENV === 'production') {
      // Connect to your monitoring system
    }
  }
};

// Enhanced connection function with dating analytics
const connectDB = async () => {
  if (connectionState.isConnected) {
    console.log('💞 [RudaDB] Already connected to love database');
    return mongoose.connection;
  }
  
  if (connectionState.isConnecting) {
    console.log('⏳ [RudaDB] Connection in progress...');
    return mongoose.connection;
  }

  setupConnectionEvents();

  try {
    const startTime = Date.now();
    connectionState.isConnecting = true;
    
    await mongoose.connect(process.env.MONGO_URI, connectionOptions);
    
    // Verify connection with dating-specific check
    const [pingResult, userCount] = await Promise.all([
      mongoose.connection.db.admin().ping(),
      mongoose.connection.collection('users').estimatedDocumentCount()
    ]);
    
    connectionAnalytics.averageConnectionTime = 
      (connectionAnalytics.averageConnectionTime * (connectionAnalytics.totalConnections - 1) + 
      (Date.now() - startTime)) / connectionAnalytics.totalConnections;
    
    console.log('📊 [RudaDB] Connection metrics:', {
      ping: pingResult,
      totalUsers: userCount,
      avgConnectTime: connectionAnalytics.averageConnectionTime.toFixed(2) + 'ms'
    });
    
    await setupIndexes();
    
    return mongoose.connection;
  } catch (err) {
    connectionState.isConnecting = false;
    console.error('❌ [RudaDB] Initial connection failed:', err.message);
    
    if (process.env.NODE_ENV === 'production') {
      // Implement dating app-specific alerting
    }
    throw err;
  }
};

// Graceful shutdown with dating-specific cleanup
const gracefulShutdown = async () => {
  console.log('\n💔 [RudaDB] Closing connection gracefully...');
  try {
    // Save final online status metrics
    await updateOnlineUsersCount();
    console.log(`👋 [RudaDB] Final online users: ${connectionState.onlineUsersCount}`);
    
    await mongoose.disconnect();
    console.log('✅ [RudaDB] Connection closed');
  } catch (err) {
    console.error('❌ [RudaDB] Failed to close connection:', err.message);
  }
};

// Enhanced debugging for dating operations
if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', (collectionName, method, query, doc) => {
    const logEmoji = collectionName === 'users' ? '👤' : 
                    collectionName === 'photos' ? '📸' :
                    collectionName === 'chats' ? '💬' : '📦';
    
    console.log(`${logEmoji} [RudaDB] ${collectionName}.${method}`, {
      query: JSON.stringify(query),
      doc: JSON.stringify(doc).slice(0, 100) + (JSON.stringify(doc).length > 100 ? '...' : '')
    });
  });
}

// Handle process termination with dating flair
process.on('SIGINT', () => {
  console.log('\n💌 [RudaDB] Received breakup signal (SIGINT)');
  gracefulShutdown().finally(() => process.exit(0));
});

process.on('SIGTERM', () => {
  console.log('\n🕊️ [RudaDB] Received gentle goodbye (SIGTERM)');
  gracefulShutdown().finally(() => process.exit(0));
});

module.exports = {
  connectDB,
  connection: mongoose.connection,
  gracefulShutdown,
  setupIndexes,
  getOnlineCount: () => connectionState.onlineUsersCount,
  getConnectionStats: () => ({
    ...connectionState,
    ...connectionAnalytics
  })
};