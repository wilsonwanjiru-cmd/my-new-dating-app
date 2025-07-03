const mongoose = require("mongoose");
require('dotenv').config();

// Connection state tracking
let isConnected = false;
let isConnecting = false;

const connectDB = async () => {
  // Prevent multiple connection attempts
  if (isConnected) return mongoose.connection;
  if (isConnecting) {
    console.log('⏳ Connection attempt already in progress');
    return mongoose.connection;
  }

  isConnecting = true;

  // Enhanced connection options
  const connectionOptions = {
    serverSelectionTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    maxPoolSize: 50,
    minPoolSize: 5,
    heartbeatFrequencyMS: 10000,
    retryWrites: true,
    w: 'majority',
    retryReads: true,
    connectTimeoutMS: 30000
  };

  // Connection event listeners
  mongoose.connection.on('connecting', () => {
    console.log('🔄 Connecting to MongoDB...');
  });

  mongoose.connection.on('connected', () => {
    isConnected = true;
    isConnecting = false;
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
    isConnected = false;
    console.log('⚠️  MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
    isConnected = true;
    console.log('♻️  MongoDB reconnected');
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err.message);
  });

  // Debugging in development
  if (process.env.NODE_ENV === 'development') {
    mongoose.set('debug', (collectionName, method, query, doc) => {
      console.log(`MongoDB: ${collectionName}.${method}`, {
        query: JSON.stringify(query),
        doc: JSON.stringify(doc)
      });
    });
  }

  try {
    // Connect with enhanced retry logic
    let attempts = 0;
    const maxAttempts = 5;
    const initialDelay = 1000; // 1 second
    
    while (attempts < maxAttempts) {
      try {
        console.log(`Attempt ${attempts + 1} of ${maxAttempts}`);
        await mongoose.connect(process.env.MONGO_URI, connectionOptions);
        
        // Verify connection with ping
        const pingResult = await mongoose.connection.db.admin().ping();
        console.log('📊 MongoDB pinged successfully:', pingResult);
        
        // Set up indexes after successful connection
        await setupIndexes();
        
        return mongoose.connection;
      } catch (connectErr) {
        attempts++;
        console.error(`❌ Connection attempt ${attempts} failed`, connectErr.message);
        
        if (attempts >= maxAttempts) {
          throw new Error(`Failed to connect after ${maxAttempts} attempts: ${connectErr.message}`);
        }
        
        // Exponential backoff with jitter
        const delay = Math.min(initialDelay * Math.pow(2, attempts), 30000) + Math.random() * 1000;
        console.log(`⏳ Retrying in ${Math.round(delay/1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (err) {
    isConnecting = false;
    console.error('❌ Critical MongoDB connection failure:', err);
    
    if (process.env.NODE_ENV === 'production') {
      // Graceful shutdown in production
      console.error('🚨 Application shutting down due to database connection failure');
      process.exit(1);
    }
    throw err;
  } finally {
    isConnecting = false;
  }
};

// Database indexes setup
async function setupIndexes() {
  try {
    // Create your indexes here
    await mongoose.connection.collection('users').createIndex({ email: 1 }, { unique: true, background: true });
    await mongoose.connection.collection('chats').createIndex(
      { senderId: 1, receiverId: 1, timestamp: -1 }, 
      { background: true }
    );
    console.log('🔍 Database indexes verified/created');
  } catch (indexError) {
    console.error('❌ Failed to create indexes:', indexError);
  }
}

// Graceful shutdown handlers
const gracefulShutdown = async (signal) => {
  console.log(`\n🛑 Received ${signal}, closing MongoDB connection...`);
  try {
    await mongoose.connection.close(false);
    console.log('✅ MongoDB connection closed gracefully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to close MongoDB connection gracefully:', err);
    process.exit(1);
  }
};

// Handle different shutdown signals
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGHUP', () => gracefulShutdown('SIGHUP'));

// Automatic reconnection in production
mongoose.connection.on('disconnected', () => {
  if (process.env.NODE_ENV === 'production' && !isConnecting) {
    console.log('🔄 Attempting to reconnect to MongoDB...');
    setTimeout(() => {
      if (!isConnected && !isConnecting) {
        connectDB().catch(err => {
          console.error('❌ Automatic reconnection failed:', err.message);
        });
      }
    }, 5000);
  }
});

// Export as an object with named exports
module.exports = {
  connectDB,
  connection: mongoose.connection,
  gracefulShutdown,
  setupIndexes
};