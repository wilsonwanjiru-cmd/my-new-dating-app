const mongoose = require('mongoose');
require('dotenv').config();

// Connection state tracking
const connectionState = {
  isConnected: false,
  isConnecting: false,
  retryCount: 0,
  maxRetries: 5
};

// Enhanced connection options
const connectionOptions = {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 30000,
  connectTimeoutMS: 10000,
  maxPoolSize: 50,
  minPoolSize: 5,
  heartbeatFrequencyMS: 10000,
  retryWrites: true,
  w: 'majority',
  retryReads: true
};

// Connection event handlers
const setupConnectionEvents = () => {
  mongoose.connection.on('connecting', () => {
    console.log('🔄 Connecting to MongoDB...');
    connectionState.isConnecting = true;
  });

  mongoose.connection.on('connected', () => {
    connectionState.isConnected = true;
    connectionState.isConnecting = false;
    connectionState.retryCount = 0;
    console.log('✅ MongoDB connected successfully');
    console.log(`Database: ${mongoose.connection.db.databaseName}`);
    console.log(`Host: ${mongoose.connection.host}`);
    console.log(`Port: ${mongoose.connection.port}`);
  });

  mongoose.connection.on('open', () => {
    console.log('🔓 MongoDB connection is open');
  });

  mongoose.connection.on('disconnecting', () => {
    console.log('🔽 MongoDB disconnecting...');
  });

  mongoose.connection.on('disconnected', () => {
    connectionState.isConnected = false;
    console.log('⚠️  MongoDB disconnected');
    attemptReconnection();
  });

  mongoose.connection.on('reconnected', () => {
    connectionState.isConnected = true;
    console.log('♻️  MongoDB reconnected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });
};

// Automatic reconnection logic
const attemptReconnection = () => {
  if (connectionState.isConnecting || !process.env.MONGO_URI) return;

  if (connectionState.retryCount < connectionState.maxRetries) {
    const delay = Math.min(5000 * Math.pow(2, connectionState.retryCount), 30000);
    connectionState.retryCount++;
    
    console.log(`⏳ Attempting reconnection (${connectionState.retryCount}/${connectionState.maxRetries}) in ${delay}ms...`);
    
    setTimeout(async () => {
      try {
        await mongoose.connect(process.env.MONGO_URI, connectionOptions);
      } catch (err) {
        console.error(`❌ Reconnection attempt ${connectionState.retryCount} failed:`, err.message);
        attemptReconnection();
      }
    }, delay);
  } else {
    console.error(`🚨 Maximum reconnection attempts (${connectionState.maxRetries}) reached`);
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    }
  }
};

// Database indexes setup
const setupIndexes = async () => {
  try {
    // User indexes
    await mongoose.connection.collection('users').createIndex(
      { email: 1 }, 
      { unique: true, background: true }
    );
    
    // Chat indexes
    await mongoose.connection.collection('chats').createIndex(
      { participants: 1, timestamp: -1 },
      { background: true }
    );
    
    // Message indexes
    await mongoose.connection.collection('messages').createIndex(
      { chatId: 1, timestamp: -1 },
      { background: true }
    );

    console.log('🔍 Database indexes verified/created');
  } catch (err) {
    console.error('❌ Failed to create indexes:', err.message);
    if (process.env.NODE_ENV === 'production') {
      // Implement your error reporting here
    }
  }
};

// Main connection function
const connectDB = async () => {
  if (connectionState.isConnected) return mongoose.connection;
  if (connectionState.isConnecting) {
    console.log('⏳ Connection attempt already in progress');
    return mongoose.connection;
  }

  setupConnectionEvents();

  try {
    connectionState.isConnecting = true;
    
    await mongoose.connect(process.env.MONGO_URI, connectionOptions);
    
    // Verify connection with ping
    const pingResult = await mongoose.connection.db.admin().ping();
    console.log('📊 MongoDB pinged successfully:', pingResult);
    
    // Setup indexes
    await setupIndexes();
    
    return mongoose.connection;
  } catch (err) {
    connectionState.isConnecting = false;
    console.error('❌ Initial connection failed:', err.message);
    
    if (process.env.NODE_ENV === 'production') {
      // Implement your error reporting here
      console.error('🚨 Application may start with degraded functionality');
    }
    throw err;
  }
};

// Graceful shutdown handler
const gracefulShutdown = async () => {
  console.log('\n🛑 Closing MongoDB connection gracefully...');
  try {
    await mongoose.disconnect();
    console.log('✅ MongoDB connection closed');
  } catch (err) {
    console.error('❌ Failed to close MongoDB connection:', err.message);
  }
};

// Debugging in development
if (process.env.NODE_ENV === 'development') {
  mongoose.set('debug', (collectionName, method, query, doc) => {
    console.log(`MongoDB: ${collectionName}.${method}`, {
      query: JSON.stringify(query),
      doc: JSON.stringify(doc)
    });
  });
}

// Handle process termination
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);

module.exports = {
  connectDB,
  connection: mongoose.connection,
  gracefulShutdown,
  setupIndexes
};