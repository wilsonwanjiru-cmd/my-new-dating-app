const mongoose = require("mongoose");
require('dotenv').config();

const connectDB = async () => {
  // Remove deprecated options and add new recommended settings
  const connectionOptions = {
    serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
    socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    maxPoolSize: 10, // Maintain up to 10 socket connections
  };

  // Set up MongoDB connection event listeners
  mongoose.connection.on('connecting', () => {
    console.log('🔄 Connecting to MongoDB...');
  });

  mongoose.connection.on('connected', () => {
    console.log('✅ MongoDB connected successfully');
    console.log(`Database: ${mongoose.connection.db.databaseName}`);
    console.log(`Models: ${Object.keys(mongoose.connection.models).join(', ')}`);
  });

  mongoose.connection.on('error', (err) => {
    console.error('❌ MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.log('⚠️  MongoDB disconnected');
  });

  // Enable debug mode in development
  if (process.env.NODE_ENV === 'development') {
    mongoose.set('debug', (collectionName, method, query, doc) => {
      console.log(`MongoDB: ${collectionName}.${method}`, {
        query,
        doc
      });
    });
  }

  try {
    await mongoose.connect(process.env.MONGO_URI, connectionOptions);
    
    // Verify the connection is ready
    await mongoose.connection.db.admin().ping();
    console.log('📊 MongoDB pinged successfully');
    
  } catch (err) {
    console.error('❌ Failed to connect to MongoDB', err);
    
    // Graceful shutdown if in production
    if (process.env.NODE_ENV === 'production') {
      process.exit(1);
    } else {
      // In development, you might want to continue with mock data
      console.warn('⚠️  Continuing in development mode with mock data');
    }
  }
};

// Close the Mongoose connection when the Node process ends
process.on('SIGINT', async () => {
  await mongoose.connection.close();
  console.log('MongoDB connection closed due to app termination');
  process.exit(0);
});

module.exports = connectDB;