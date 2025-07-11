module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log(`New socket connection: ${socket.id}`);

    // Join user-specific room
    socket.on('join-user', (userId) => {
      socket.join(`user-${userId}`);
      console.log(`User ${userId} joined their socket room`);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });

    // Error handling
    socket.on('error', (err) => {
      console.error('Socket error:', err);
    });
  });

  // Make io available globally for emitting events
  global.io = io;
};