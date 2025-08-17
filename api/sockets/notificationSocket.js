const User = require('../models/user');

module.exports = (io) => {
  io.on('connection', (socket) => {
    const userId = socket.handshake.query.userId;
    console.log(`New connection: ${socket.id} (User: ${userId})`);

    // ======================
    // 1. USER STATUS HANDLING
    // ======================
    const updateOnlineStatus = async (isOnline) => {
      try {
        const user = await User.findById(userId);
        if (!user) return;

        if (isOnline) {
          // Mark online and add session
          user.isOnline = true;
          user.lastActive = new Date();
          user.activeSessions.addToSet(socket.id);
        } else {
          // Remove session and mark offline if no sessions left
          user.activeSessions.pull(socket.id);
          if (user.activeSessions.length === 0) {
            user.isOnline = false;
          }
        }
        await user.save();

        // Broadcast status change
        io.emit('user-status-update', {
          userId,
          isOnline: user.isOnline,
          lastActive: user.lastActive
        });
      } catch (err) {
        console.error('Status update error:', err);
      }
    };

    // Initial online marking
    updateOnlineStatus(true);

    // ======================
    // 2. NOTIFICATION ROOMS
    // ======================
    socket.on('join-user', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined notification room`);
    });

    // ======================
    // 3. HEARTBEAT SYSTEM
    // ======================
    let heartbeatInterval;
    
    const startHeartbeat = () => {
      heartbeatInterval = setInterval(() => {
        socket.emit('heartbeat');
      }, 45000); // 45 seconds
    };

    socket.on('heartbeat-ack', () => {
      User.findByIdAndUpdate(userId, { lastActive: new Date() }).exec();
    });

    // ======================
    // 4. DISCONNECTION HANDLING
    // ======================
    socket.on('disconnect', async () => {
      console.log(`Disconnected: ${socket.id}`);
      clearInterval(heartbeatInterval);
      await updateOnlineStatus(false);
    });

    // ======================
    // 5. ERROR HANDLING
    // ======================
    socket.on('error', (err) => {
      console.error(`Socket error (User ${userId}):`, err);
    });
  });

  // ======================
  // GLOBAL EVENT EMITTERS
  // ======================
  global.io = io;

  /** 
   * Send notification to specific user
   * @param {string} userId - Target user ID
   * @param {object} notification - Notification payload
   */
  global.sendNotification = (userId, notification) => {
    io.to(`user-${userId}`).emit('new-notification', notification);
  };

  /**
   * Broadcast online status updates
   * @param {string} userId - User ID to broadcast
   */
  global.broadcastStatus = (userId) => {
    User.findById(userId, 'isOnline lastActive')
      .then(user => {
        if (user) {
          io.emit('user-status-update', {
            userId,
            isOnline: user.isOnline,
            lastActive: user.lastActive
          });
        }
      });
  };
};