import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { User } from '../models/index.js';

// Store connected users
const connectedUsers = new Map();

/**
 * Initialize Socket.IO with authentication and event handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
export const initializeSocket = (io) => {
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.JWT_SECRET);
      
      // Get user from database
      const user = await User.findById(decoded.userId)
        .populate('role')
        .select('-password');

      if (!user || !user.active) {
        return next(new Error('Authentication error: Invalid user'));
      }

      // Attach user to socket
      socket.userId = user._id.toString();
      socket.user = user;
      
      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle connections
  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId}`);
    
    // Store connected user
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Join user to their personal room
    socket.join(`user:${socket.userId}`);

    // Notify user is online
    socket.broadcast.emit('user:online', {
      userId: socket.userId,
      username: socket.user.username
    });

    // Handle chat messages
    socket.on('chat:send', async (data) => {
      try {
        const { recipientId, content } = data;
        
        // Validate data
        if (!recipientId || !content) {
          socket.emit('error', { message: 'Invalid message data' });
          return;
        }

        // Create and save message (this would use your chat service)
        const message = {
          id: new Date().getTime(), // temporary ID
          senderId: socket.userId,
          recipientId,
          content,
          timestamp: new Date(),
          status: 'SENT'
        };

        // Send to recipient if online
        const recipientSocket = connectedUsers.get(recipientId);
        if (recipientSocket) {
          io.to(`user:${recipientId}`).emit('chat:message', {
            ...message,
            status: 'DELIVERED'
          });
        }

        // Confirm to sender
        socket.emit('chat:sent', { messageId: message.id });
        
      } catch (error) {
        logger.error('Chat message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    // Handle message read receipts
    socket.on('chat:read', async (data) => {
      try {
        const { messageIds, senderId } = data;
        
        // Update message status to READ (use your service here)
        
        // Notify sender if online
        const senderSocket = connectedUsers.get(senderId);
        if (senderSocket) {
          io.to(`user:${senderId}`).emit('chat:read', {
            messageIds,
            readBy: socket.userId,
            readAt: new Date()
          });
        }
      } catch (error) {
        logger.error('Chat read error:', error);
      }
    });

    // Handle typing indicators
    socket.on('chat:typing:start', (data) => {
      const { recipientId } = data;
      const recipientSocket = connectedUsers.get(recipientId);
      if (recipientSocket) {
        io.to(`user:${recipientId}`).emit('chat:typing:start', {
          userId: socket.userId,
          username: socket.user.username
        });
      }
    });

    socket.on('chat:typing:stop', (data) => {
      const { recipientId } = data;
      const recipientSocket = connectedUsers.get(recipientId);
      if (recipientSocket) {
        io.to(`user:${recipientId}`).emit('chat:typing:stop', {
          userId: socket.userId
        });
      }
    });

    // Handle interview signaling
    socket.on('interview:join', (data) => {
      const { roomId } = data;
      socket.join(`interview:${roomId}`);
      
      socket.to(`interview:${roomId}`).emit('interview:user-joined', {
        userId: socket.userId,
        username: socket.user.username
      });
    });

    socket.on('interview:leave', (data) => {
      const { roomId } = data;
      socket.leave(`interview:${roomId}`);
      
      socket.to(`interview:${roomId}`).emit('interview:user-left', {
        userId: socket.userId
      });
    });

    // WebRTC signaling for interviews
    socket.on('interview:signal', (data) => {
      const { roomId, targetUserId, signalData } = data;
      
      if (targetUserId) {
        // Send to specific user
        io.to(`user:${targetUserId}`).emit('interview:signal', {
          fromUserId: socket.userId,
          signalData
        });
      } else {
        // Broadcast to room
        socket.to(`interview:${roomId}`).emit('interview:signal', {
          fromUserId: socket.userId,
          signalData
        });
      }
    });

    // Handle notifications
    socket.on('notification:read', (data) => {
      const { notificationId } = data;
      // Update notification status (use your service here)
    });

    // Handle job alerts
    socket.on('job:alert:subscribe', (data) => {
      const { keywords } = data;
      // Subscribe to job alerts based on keywords
      keywords.forEach(keyword => {
        socket.join(`job-alert:${keyword}`);
      });
    });

    socket.on('job:alert:unsubscribe', (data) => {
      const { keywords } = data;
      keywords.forEach(keyword => {
        socket.leave(`job-alert:${keyword}`);
      });
    });

    // Handle disconnection
    socket.on('disconnect', () => {
      logger.info(`User disconnected: ${socket.userId}`);
      
      // Remove from connected users
      connectedUsers.delete(socket.userId);
      
      // Notify others user is offline
      socket.broadcast.emit('user:offline', {
        userId: socket.userId
      });
    });

    // Handle errors
    socket.on('error', (error) => {
      logger.error('Socket error:', error);
    });
  });

  // Handle server-side events
  io.engine.on('connection_error', (err) => {
    logger.error('Socket connection error:', err);
  });
};

/**
 * Get online users
 * @returns {Array} Array of online users
 */
export const getOnlineUsers = () => {
  return Array.from(connectedUsers.values()).map(user => ({
    userId: user.user._id,
    username: user.user.username,
    connectedAt: user.connectedAt
  }));
};

/**
 * Check if user is online
 * @param {string} userId - User ID to check
 * @returns {boolean} True if user is online
 */
export const isUserOnline = (userId) => {
  return connectedUsers.has(userId);
};

/**
 * Send notification to user if online
 * @param {string} userId - User ID
 * @param {Object} notification - Notification data
 */
export const sendNotificationToUser = (io, userId, notification) => {
  if (isUserOnline(userId)) {
    io.to(`user:${userId}`).emit('notification:new', notification);
  }
};

/**
 * Send job alert to subscribed users
 * @param {string} keyword - Job keyword
 * @param {Object} jobData - Job data
 */
export const sendJobAlert = (io, keyword, jobData) => {
  io.to(`job-alert:${keyword}`).emit('job:alert', jobData);
};

export const socketService = {
  initializeSocket,
  getOnlineUsers,
  isUserOnline,
  sendNotificationToUser,
  sendJobAlert
};

export default socketService;
