const mongoose = require("mongoose");
require('dotenv').config();

const connectDB = async () => {
  // Enhanced connection options
  const connectionOptions = {
    serverSelectionTimeoutMS: 5000,        // 5 seconds to select server
    socketTimeoutMS: 45000,               // 45 seconds socket timeout
    maxPoolSize: 10,                      // Maximum connections in pool
    minPoolSize: 2,                       // Minimum connections to maintain
    heartbeatFrequencyMS: 10000,          // Send heartbeat every 10 seconds
    retryWrites: true,
    w: 'majority',
    retryReads: true,
    connectTimeoutMS: 10000               // 10 seconds connection timeout
  };

  // Connection event listeners
  mongoose.connection.on('connecting', () => {
    console.log('🔄 Connecting to MongoDB...');
  });

  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected successfully');
    console.log(`Database: ${mongoose.connection.db.databaseName}`);
  });

  mongoose.connection.on('open', () => {
    console.log('🔓 MongoDB connection is open');
  });

  mongoose.connection.on('disconnecting', () => {
    console.log('🔽 MongoDB disconnecting...');
  });

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
  });

  mongoose.connection.on('reconnected', () => {
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
    // Connect with retry logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        await mongoose.connect(process.env.MONGO_URI, connectionOptions);
        
        // Verify connection with ping
        await mongoose.connection.db.admin().ping();
        console.log('📊 MongoDB pinged successfully');
        
        return;
      } catch (connectErr) {
        attempts++;
        console.error(`❌ Connection attempt ${attempts} failed`, connectErr.message);
        
        if (attempts >= maxAttempts) {
          throw connectErr;
        }
        
        // Exponential backoff
        const delay = Math.pow(2, attempts) * 1000;
        console.log(`⏳ Retrying in ${delay/1000} seconds...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB after retries', err);
    
    if (process.env.NODE_ENV === 'production') {
      // Graceful shutdown in production
      process.exit(1);
    } else {
      // Continue in development with warning
      console.warn('⚠️  Continuing in development mode with limited functionality');
    }
  }
};

// Graceful shutdown handlers
const gracefulShutdown = async () => {
  try {
    await mongoose.connection.close(false); // Force close after timeout
    console.log('✅ MongoDB connection closed gracefully');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to close MongoDB connection', err);
    process.exit(1);
  }
};

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('SIGHUP', gracefulShutdown);

// Reconnect on connection loss
mongoose.connection.on('disconnected', () => {
  if (process.env.NODE_ENV === 'production') {
    console.log('🔄 Attempting to reconnect to MongoDB...');
    setTimeout(() => connectDB(), 5000);
  }
});

module.exports = connectDB;