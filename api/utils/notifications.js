// /api/utils/notifications.js
const { google } = require('googleapis');
const admin = require('firebase-admin');
require('dotenv').config();

// Debugging: Verify environment variables are loaded
console.log('Initializing notifications with:');
console.log('Project ID:', process.env.FIREBASE_PROJECT_ID);
console.log('Service Account Email:', process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL ? 'Exists' : 'Missing');
console.log('Private Key:', process.env.GOOGLE_PRIVATE_KEY ? 'Exists' : 'Missing');
console.log('Firebase Admin Config:', process.env.FIREBASE_ADMIN_SDK_CONFIG ? 'Exists' : 'Missing');

let fcm;
let useFirebaseAdmin = false;
let useGoogleFCM = false;

// Initialize Firebase Admin SDK (Recommended Approach)
if (process.env.FIREBASE_ADMIN_SDK_CONFIG) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_ADMIN_SDK_CONFIG);
    
    // Fix newlines in private key if needed
    if (typeof serviceAccount.private_key === 'string') {
      serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, '\n');
    }

    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: process.env.FIREBASE_PROJECT_ID
    });
    
    useFirebaseAdmin = true;
    console.log('✅ Firebase Admin initialized successfully');
  } catch (error) {
    console.error('⚠️ Failed to initialize Firebase Admin:', error.message);
    console.error('Error details:', error);
  }
}

// Initialize Google FCM (Fallback Approach)
if (!useFirebaseAdmin && 
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && 
    process.env.GOOGLE_PRIVATE_KEY && 
    process.env.FIREBASE_PROJECT_ID) {
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: {
        client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
        private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n')
      },
      scopes: ['https://www.googleapis.com/auth/firebase.messaging']
    });

    fcm = google.firebase({
      version: 'v1',
      auth
    });
    
    useGoogleFCM = true;
    console.log('✅ Google FCM initialized successfully');
  } catch (error) {
    console.error('⚠️ Failed to initialize Google FCM:', error.message);
    console.error('Error details:', error);
  }
}

// Final initialization check
if (!useFirebaseAdmin && !useGoogleFCM) {
  console.warn('⚠️ No notification provider initialized - falling back to stubs');
}

/**
 * Enhanced push notification sender with retry logic
 */
const sendPushNotification = async (deviceToken, payload, retries = 2) => {
  // Try Firebase Admin first
  if (useFirebaseAdmin) {
    try {
      const message = {
        token: deviceToken,
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: payload.data || {},
        android: {
          priority: 'high'
        },
        apns: {
          payload: {
            aps: {
              'content-available': 1,
              'mutable-content': 1
            }
          },
          headers: {
            'apns-priority': '10'
          }
        }
      };

      const response = await admin.messaging().send(message);
      console.log('✅ Notification sent via Firebase Admin');
      return { 
        status: 'success',
        provider: 'firebase-admin',
        response 
      };
    } catch (error) {
      console.error('❌ Firebase Admin Error:', error.message);
      if (retries > 0) {
        console.log(`🔄 Retrying (${retries} attempts remaining)...`);
        return await sendPushNotification(deviceToken, payload, retries - 1);
      }
    }
  }
  
  // Fallback to Google FCM
  if (useGoogleFCM) {
    try {
      const response = await fcm.projects.messages.send({
        parent: `projects/${process.env.FIREBASE_PROJECT_ID}`,
        requestBody: {
          message: {
            token: deviceToken,
            notification: {
              title: payload.title,
              body: payload.body
            },
            data: payload.data || {},
            android: {
              priority: 'HIGH'
            },
            apns: {
              headers: {
                'apns-priority': '10'
              }
            }
          }
        }
      });
      
      console.log('✅ Notification sent via Google FCM');
      return { 
        status: 'success',
        provider: 'google-fcm',
        response: response.data 
      };
    } catch (error) {
      console.error('❌ Google FCM Error:', error.message);
      if (retries > 0) {
        console.log(`🔄 Retrying (${retries} attempts remaining)...`);
        return await sendPushNotification(deviceToken, payload, retries - 1);
      }
    }
  }

  // Final fallback to stub
  console.log('🔶 Notification stub used (no providers available)');
  return { 
    status: 'stub',
    provider: 'none',
    message: 'Notification would be sent in production',
    details: {
      deviceToken,
      title: payload.title,
      body: payload.body,
      data: payload.data || {}
    }
  };
};

/**
 * Optimized bulk notification sender
 */
const sendBulkNotifications = async (tokens, payload) => {
  if (!tokens || tokens.length === 0) {
    console.log('No tokens provided for bulk notifications');
    return [];
  }

  // Firebase Admin multicast (most efficient)
  if (useFirebaseAdmin) {
    try {
      const message = {
        notification: {
          title: payload.title,
          body: payload.body
        },
        data: payload.data || {},
        tokens: tokens.filter(t => t) // Remove any falsy tokens
      };

      const response = await admin.messaging().sendMulticast(message);
      
      console.log(`✅ Sent ${response.successCount}/${tokens.length} notifications via Firebase Admin multicast`);
      
      // Handle partial failures
      if (response.failureCount > 0) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            console.error(`Failed to send to ${tokens[idx]}:`, resp.error?.message);
          }
        });
      }
      
      return response;
    } catch (error) {
      console.error('❌ Firebase Admin bulk send error:', error.message);
    }
  }

  // Fallback to individual sends
  try {
    console.log(`⏳ Sending ${tokens.length} notifications individually...`);
    const results = await Promise.allSettled(
      tokens.map(token => 
        token ? sendPushNotification(token, payload) : Promise.resolve(null)
      )
    );

    const successful = results.filter(r => r.status === 'fulfilled' && r.value);
    const failed = results.filter(r => r.status === 'rejected' || !r.value);
    
    console.log(`✅ Sent ${successful.length}/${tokens.length} notifications`);
    
    if (failed.length > 0) {
      console.error(`❌ ${failed.length} notifications failed`);
    }
    
    return results;
  } catch (error) {
    console.error('Bulk notification error:', error);
    throw error;
  }
};

// Notification templates with enhanced Flutter support
const notificationUtils = {
  createMatchNotification: (userName, matchName, matchId) => ({
    title: 'New Match! 💕',
    body: `You matched with ${matchName}`,
    data: {
      type: 'match',
      userId: userName,
      matchId: matchId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      route: '/matches',
      payload: JSON.stringify({ matchId })
    }
  }),

  createMessageNotification: (senderName, message, chatId) => ({
    title: `New message from ${senderName}`,
    body: message.length > 100 ? message.substring(0, 97) + '...' : message,
    data: {
      type: 'message',
      chatId: chatId,
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      route: '/chats',
      payload: JSON.stringify({ chatId })
    }
  }),

  createSystemNotification: (title, body, data = {}) => ({
    title,
    body,
    data: {
      ...data,
      type: 'system',
      click_action: 'FLUTTER_NOTIFICATION_CLICK',
      timestamp: new Date().toISOString()
    }
  })
};

// Test function (can be removed in production)
const testNotificationSystem = async () => {
  console.log('\n🔍 Testing notification system...');
  try {
    const testToken = 'test_token';
    const testPayload = notificationUtils.createSystemNotification(
      'System Test',
      'This is a test notification'
    );
    
    const result = await sendPushNotification(testToken, testPayload);
    console.log('Test result:', result);
    
    return result;
  } catch (error) {
    console.error('Notification test failed:', error);
    throw error;
  }
};

// Uncomment to run test on startup
// testNotificationSystem();

module.exports = {
  sendPushNotification,
  sendBulkNotifications,
  ...notificationUtils,
  testNotificationSystem // Optional: can be removed in production
};