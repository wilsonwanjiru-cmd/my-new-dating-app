// sockets/chatSocket.js
module.exports = (io) => {
  io.on('connection', (socket) => {
    console.log('New chat connection:', socket.id);

    // Join a room based on chatId
    socket.on('join-chat', (chatId) => {
      socket.join(chatId);
      console.log(`User joined chat: ${chatId}`);
    });

    // Handle new messages
    socket.on('send-message', (data) => {
      const { chatId, message } = data;
      io.to(chatId).emit('receive-message', message);
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
};