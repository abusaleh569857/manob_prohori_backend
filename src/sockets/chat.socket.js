const jwt = require('jsonwebtoken');
const chatService = require('../services/chat.service');
const chatRepository = require('../repositories/chat.repository');

const initChatSocket = (io) => {
  // Socket Authentication Middleware
  io.use((socket, next) => {
    try {
      const token =
        socket.handshake.auth?.token ||
        (socket.handshake.headers?.authorization &&
          socket.handshake.headers.authorization.replace('Bearer ', ''));

      if (!token) {
        return next(new Error('Authentication required for real-time live channel'));
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'manob_prohori_default_secret_key_2026');
      socket.user = decoded;
      next();
    } catch (err) {
      console.warn('Socket authentication failed:', err.message);
      next(new Error('Invalid or expired socket authentication token'));
    }
  });

  io.on('connection', (socket) => {
    const userId = socket.user.id;
    // Join user's personal alert room for targeted notifications
    socket.join(`user_${userId}`);

    // Join Incident Live Chat Channel
    socket.on('join_incident', async ({ incidentId }, callback) => {
      try {
        if (!incidentId) return;
        const auth = await chatRepository.isUserAuthorizedForIncident(incidentId, userId);
        if (!auth.authorized) {
          if (callback) callback({ success: false, message: 'Unauthorized for this incident channel' });
          return;
        }

        const room = `incident_${incidentId}`;
        socket.join(room);

        if (callback) {
          callback({ success: true, room, role: auth.role });
        }
      } catch (err) {
        console.error('Error joining incident chat socket room:', err);
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // Leave Incident Channel
    socket.on('leave_incident', ({ incidentId }) => {
      if (incidentId) {
        socket.leave(`incident_${incidentId}`);
      }
    });

    // Real-time Message Dispatch
    socket.on('send_incident_message', async (data, callback) => {
      try {
        const { incidentId, body, messageType, latitude, longitude, attachments } = data;
        const message = await chatService.sendMessage(incidentId, userId, {
          body,
          messageType,
          latitude,
          longitude,
          attachments
        });

        // Broadcast to everyone in the room
        io.to(`incident_${incidentId}`).emit('new_incident_message', {
          incidentId,
          message
        });

        if (callback) callback({ success: true, data: message });
      } catch (err) {
        console.error('Error sending socket incident message:', err);
        if (callback) callback({ success: false, message: err.message });
      }
    });

    // Typing Indicators
    socket.on('typing', ({ incidentId, userName }) => {
      if (incidentId) {
        socket.to(`incident_${incidentId}`).emit('user_typing', {
          incidentId,
          userId,
          userName: userName || 'Responder'
        });
      }
    });

    socket.on('stop_typing', ({ incidentId }) => {
      if (incidentId) {
        socket.to(`incident_${incidentId}`).emit('user_stop_typing', {
          incidentId,
          userId
        });
      }
    });

    socket.on('disconnect', () => {
      // Disconnect cleanup handled by socket.io automatically
    });
  });
};

module.exports = { initChatSocket };
