// sockets/statusSocket.js
let onlineUsers = new Set();

module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`Status client connected: ${socket.id}`);

    // Listen for user online event
    socket.on('user-online', (userId) => {
      try {
        // Validate user ID
        if (!mongoose.Types.ObjectId.isValid(userId)) {
          console.warn(`Invalid user ID: ${userId}`);
          return;
        }

        console.log(`User ${userId} came online`);
        
        // Add user to online set
        onlineUsers.add(userId.toString());
        
        // Update user status in database
        User.findByIdAndUpdate(
          userId, 
          { online: true, lastActive: new Date() },
          { new: true }
        ).exec();
        
        // Broadcast updated online list
        io.emit('online-users', Array.from(onlineUsers));
        
        // Store userId in socket for disconnection
        socket.userId = userId;
        
      } catch (error) {
        console.error('Error handling user-online event:', error);
      }
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      try {
        if (socket.userId) {
          console.log(`User ${socket.userId} disconnected`);
          
          // Remove user from online set
          onlineUsers.delete(socket.userId.toString());
          
          // Update user status in database
          User.findByIdAndUpdate(
            socket.userId, 
            { online: false },
            { new: true }
          ).exec();
          
          // Broadcast updated online list
          io.emit('online-users', Array.from(onlineUsers));
        }
        console.log(`Status client disconnected: ${socket.id}`);
      } catch (error) {
        console.error('Error handling disconnect event:', error);
      }
    });

    // Periodically clean up online users (every 5 minutes)
    setInterval(() => {
      console.log('Running online users cleanup');
      const currentSize = onlineUsers.size;
      
      // Remove users not active in last 5 minutes
      const now = Date.now();
      onlineUsers = new Set(
        Array.from(onlineUsers).filter(userId => {
          // This would require tracking last activity per user
          return true; // Simplified for now
        })
      );
      
      if (onlineUsers.size !== currentSize) {
        io.emit('online-users', Array.from(onlineUsers));
      }
    }, 5 * 60 * 1000); // 5 minutes
  });
};