// src/socket/index.js
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { User } from '../models/index.js';
import { registerChatHandlers } from './handlers/chat.handler.js';
import { registerInterviewHandlers } from './handlers/interview.handler.js';

// Store connected users (Map: userId -> { socketId, user, connectedAt })
const connectedUsers = new Map();

// Store interview room participants (Map: roomId -> Set<userId>)
const interviewRoomParticipants = new Map();

/**
 * Initialize Socket.IO with authentication and event handlers
 * @param {SocketIO.Server} io - Socket.IO server instance
 */
export const initializeSocket = (io) => {
  logger.info('Initializing Socket.IO...');
  // Authentication middleware for Socket.IO
  io.use(async (socket, next) => {
    try {
      logger.info(`Socket connection attempt from ${socket.conn.remoteAddress || 'unknown'}`);
      // check userId
      logger.info(`Socket connection attempt userId : ${JSON.stringify(socket.handshake.auth) || 'unknown'}`);

      const token = socket.handshake.auth.token || socket.handshake.headers.authorization?.split(' ')[1];

      if (!token) {
        return next(new Error('Authentication error: No token provided'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, config.JWT_SECRET);

      // Get user from database
      const user = await User.findById(decoded.userId || decoded.id || decoded._id) // Support both decoded.userId and decoded.id
        .select('-password'); // Bỏ password khỏi user object

      if (!user || !user.active) {
        return next(new Error('Authentication error: Invalid user'));
      }

      // Attach user to socket
      socket.userId = user._id.toString();
      socket.user = user; // Store full user object for convenience

      next();
    } catch (error) {
      logger.error('Socket authentication error:', error);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Handle connections
  io.on('connection', (socket) => {
    logger.info(`User connected: ${socket.userId} with socket ID: ${socket.id}`);

    // Store connected user
    connectedUsers.set(socket.userId, {
      socketId: socket.id,
      user: socket.user,
      connectedAt: new Date()
    });

    // Join user to their personal room (rất quan trọng để gửi tin nhắn đến đúng người dùng)
    socket.join(`user:${socket.userId}`);

    // Send authenticated user info back to client
    socket.emit('auth:success', {
      userId: socket.userId,
      user: {
        id: socket.user._id,
        email: socket.user.email,
        name: socket.user.name,
        role: socket.user.role
      }
    });

    // Notify user is online (Optional: broadcast to all or only friends/contacts)
    io.emit('user:presence', { // Using io.emit to notify all connected clients
      userId: socket.userId,
      isOnline: true
    });

    // Send list of online users to the newly connected client
    const onlineUserIds = Array.from(connectedUsers.keys());
    socket.emit('online:users', onlineUserIds);

    // Register handlers
    registerChatHandlers(io, socket, connectedUsers);
    registerInterviewHandlers(io, socket, interviewRoomParticipants);

    // Handle connection quality reporting
    socket.on('interview:connection-quality', (data) => {
      try {
        const { roomId, quality } = data;

        if (!roomId || !quality) {
          logger.warn(`Connection quality report failed: Room ID and quality data are required`);
          return;
        }

        logger.info(`Connection quality from user ${socket.userId} in room ${roomId}: ${JSON.stringify(quality)}`);

        // Broadcast quality metrics to other participants
        socket.to(`interview:${roomId}`).emit('interview:connection-quality', {
          userId: socket.userId,
          quality,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error(`Error handling connection quality from ${socket.userId}:`, error);
      }
    });

    // Handle notifications (placeholder)
    socket.on('notification:read', (data) => {
      const { notificationId } = data;
      // Update notification status (use your service here)
    });

    // Handle job alerts
    socket.on('job:alert:subscribe', (data) => {
      const { keywords } = data;
      if (Array.isArray(keywords)) {
        keywords.forEach(keyword => {
          socket.join(`job-alert:${keyword}`);
        });
      }
    });

    socket.on('job:alert:unsubscribe', (data) => {
      const { keywords } = data;
      if (Array.isArray(keywords)) {
        keywords.forEach(keyword => {
          socket.leave(`job-alert:${keyword}`);
        });
      }
    });

    // Handle request for online users
    socket.on('get:online:users', () => {
      const onlineUserIds = Array.from(connectedUsers.keys());
      socket.emit('online:users', onlineUserIds);
    });

    // Handle errors from socket events
    socket.on('error', (error) => {
      logger.error(`Socket event error for user ${socket.userId}:`, error);
    });

    // Handle disconnection
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${socket.userId} from socket ID: ${socket.id}`);

      // Remove from connected users
      connectedUsers.delete(socket.userId);

      // Notify user is offline
      io.emit('user:presence', {
        userId: socket.userId,
        isOnline: false,
        lastSeen: new Date()
      });

      // Clean up interview room tracking
      if (socket.interviewId) {
        const roomId = socket.interviewId;
        const roomName = `interview:${roomId}`;

        // Get remaining participants before cleanup
        const socketsInRoom = await io.in(roomName).fetchSockets();
        const remainingParticipants = socketsInRoom
          .filter(s => s.userId !== socket.userId)
          .map(s => s.userId);

        logger.info(`[DISCONNECT] User ${socket.userId} leaving room ${roomId}. Remaining: ${remainingParticipants.length} participants`);

        // Remove from tracking
        if (interviewRoomParticipants.has(roomId)) {
          interviewRoomParticipants.get(roomId).delete(socket.userId);

          // Clean up empty room tracking
          if (interviewRoomParticipants.get(roomId).size === 0) {
            interviewRoomParticipants.delete(roomId);
            logger.info(`[CLEANUP] Removed empty room tracking for ${roomId}`);
          }
        }

        // Notify other participants in interview room with detailed info
        socket.to(roomName).emit('interview:user-left', {
          userId: socket.userId,
          userName: socket.user?.fullName || socket.user?.name || 'User',
          userRole: socket.userRole,
          timestamp: new Date(),
          reason: 'disconnect' // Signal this is a disconnect, not a graceful leave
        });

        // CRITICAL: Emit peer-disconnected event for WebRTC cleanup
        socket.to(roomName).emit('interview:peer-disconnected', {
          userId: socket.userId,
          socketId: socket.id,
          timestamp: new Date()
        });

        logger.info(`User ${socket.userId} removed from interview room ${roomId}. Notified ${remainingParticipants.length} remaining participants.`);
      }
    });
  });

  // Handle server-side connection errors
  io.engine.on('connection_error', (err) => {
    logger.error('Socket.IO engine connection error:', err);
    if (err.req) logger.error('Request headers:', err.req.headers);
    if (err.code) logger.error('Error code:', err.code);
    if (err.message) logger.error('Error message:', err.message);
    if (err.context) logger.error('Error context:', err.context);
  });
};

/**
 * Get online users
 * @returns {Array} Array of online users
 */
export const getOnlineUsers = () => {
  return Array.from(connectedUsers.values()).map(info => ({
    userId: info.user._id,
    connectedAt: info.connectedAt
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
 * (This function might be more generic and used by other services, e.g., notification service)
 * @param {object} io - Socket.IO server instance
 * @param {string} userId - User ID
 * @param {Object} notification - Notification data
 */
export const sendNotificationToUser = (io, userId, notification) => {
  if (isUserOnline(userId)) {
    io.to(`user:${userId}`).emit('notification:new', notification);
    logger.info(`Real-time notification sent to online user ${userId}`);
  } else {
    logger.info(`User ${userId} is offline, notification would typically be stored and delivered later.`);
    // Here you would typically store the notification in DB for later retrieval
  }
};

export const socketService = {
  initializeSocket,
  getOnlineUsers,
  isUserOnline,
  sendNotificationToUser,
};
