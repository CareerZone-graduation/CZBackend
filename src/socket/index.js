// src/socket/index.js
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { User } from '../models/index.js';
import * as chatService from '../services/chat.service.js';

// Store connected users (Map: userId -> { socketId, user, connectedAt })
const connectedUsers = new Map();

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

    // Notify user is online (Optional: broadcast to all or only friends/contacts)
    io.emit('user:presence', { // Using io.emit to notify all connected clients
      userId: socket.userId,
      isOnline: true
    });

    // Client tham gia vào một cuộc trò chuyện
    socket.on('conversation:join', (data) => {
      const { conversationId } = data;
      if (conversationId) {
        logger.info(`User ${socket.userId} joined conversation room: ${conversationId}`);
        socket.join(`conversation:${conversationId}`);
      }
    });

    // Client rời khỏi một cuộc trò chuyện
    socket.on('conversation:leave', (data) => {
      const { conversationId } = data;
      if (conversationId) {
        logger.info(`User ${socket.userId} left conversation room: ${conversationId}`);
        socket.leave(`conversation:${conversationId}`);
      }
    });

    // Xử lý gửi tin nhắn mới
    socket.on('message:send', async (data, callback) => {
      logger.info(`[Socket] message:send received from user ${socket.userId}`, { conversationId: data.conversationId, tempMessageId: data.tempMessageId });
      
      try {
        const { conversationId, content, type = 'text', metadata, tempMessageId } = data;

        if (!conversationId || !content) {
          logger.warn(`[Socket] Invalid data for message:send`, { conversationId, hasContent: !!content });
          if (callback) callback({ success: false, message: 'Dữ liệu không hợp lệ.', tempMessageId });
          return;
        }

        // 1. Get conversation to determine recipient
        logger.info(`[Socket] Getting conversation ${conversationId} for user ${socket.userId}`);
        const conversationDoc = await chatService.getConversationById(conversationId, socket.userId);
        
        if (!conversationDoc) {
          if (callback) callback({ 
            success: false, 
            message: 'Cuộc trò chuyện không tồn tại.', 
            tempMessageId,
            reasonCode: 'CONVERSATION_NOT_FOUND'
          });
          return;
        }

        // 2. Determine recipient ID
        const recipientId = conversationDoc.otherParticipant._id.toString();

        // 3. Check messaging access if sender is recruiter
        if (socket.user.role === 'recruiter') {
          const accessCheck = await chatService.checkMessagingAccess(socket.userId, recipientId);
          
          if (!accessCheck.canMessage) {
            logger.warn(`Access denied: Recruiter ${socket.userId} cannot message candidate ${recipientId}. Reason: ${accessCheck.reason}`);
            if (callback) callback({ 
              success: false, 
              message: 'Bạn không có quyền gửi tin nhắn cho ứng viên này.',
              tempMessageId,
              reasonCode: accessCheck.reason
            });
            return;
          }
          
          logger.info(`Access granted: Recruiter ${socket.userId} can message candidate ${recipientId}. Reason: ${accessCheck.reason}`);
        }

        // 4. Check if this is the first message in the conversation
        const messageCount = await chatService.getConversationMessages(socket.userId, conversationId, { page: 1, limit: 1 });
        const isNewConversation = messageCount.meta.totalItems === 0;

        // 5. Lưu tin nhắn vào DB sử dụng service đã được chuẩn hóa
        const savedMessage = await chatService.sendMessage({
          senderId: socket.userId,
          conversationId,
          content,
          type,
          metadata,
        });
        
        // Convert to plain object (don't populate senderId to keep it as ID for frontend comparison)
        const messageObject = savedMessage.toObject();

        // 6. If this is a new conversation, emit conversation:created event
        if (isNewConversation) {
          logger.info(`New conversation initiated: ${conversationId} between ${socket.userId} and ${recipientId}`);
          
          // Emit to both participants
          io.to(`user:${socket.userId}`).emit('conversation:created', {
            conversationId: conversationId,
            otherParticipant: conversationDoc.otherParticipant,
            createdAt: conversationDoc.createdAt
          });
          
          io.to(`user:${recipientId}`).emit('conversation:created', {
            conversationId: conversationId,
            otherParticipant: conversationDoc.participants.find(p => p._id.toString() === socket.userId),
            createdAt: conversationDoc.createdAt
          });
        }

        // 7. Phát sự kiện tin nhắn mới CHỈ đến người nhận (không gửi cho người gửi vì họ đã có optimistic message)
        // Emit to recipient only
        socket.to(`conversation:${conversationId}`).emit('message:new', messageObject);
        
        logger.info(`[Socket] Message sent successfully from ${socket.userId} in conversation ${conversationId}`);

        // 8. Dùng callback để xác nhận tin nhắn đã được gửi và xử lý thành công
        if (callback) {
          callback({ 
            success: true, 
            message: messageObject,
            tempMessageId: tempMessageId // Gửi lại tempMessageId
          });
        }

      } catch (error) {
        logger.error(`Error sending message from ${socket.userId} in conversation ${data.conversationId}:`, error);
        if (callback) {
          callback({ 
            success: false, 
            message: error.message || 'Gửi tin nhắn thất bại.',
            tempMessageId: data.tempMessageId
          });
        }
      }
    });

    // Handle message sync after reconnection
    socket.on('messages:sync', async (data, callback) => {
      try {
        const { conversationId, since } = data;

        if (!conversationId || !since) {
          if (callback) callback({ success: false, message: 'Dữ liệu không hợp lệ.' });
          return;
        }

        logger.info(`[Socket] Syncing messages for conversation ${conversationId} since ${since}`);

        // Get conversation to verify access
        const conversationDoc = await chatService.getConversationById(conversationId, socket.userId);
        
        if (!conversationDoc) {
          if (callback) callback({ 
            success: false, 
            message: 'Cuộc trò chuyện không tồn tại.' 
          });
          return;
        }

        // Fetch messages since the given timestamp
        const ChatMessage = (await import('../models/ChatMessage.js')).default;
        const missedMessages = await ChatMessage.find({
          conversationId: conversationId,
          sentAt: { $gt: new Date(since) }
        })
          .sort({ sentAt: 1 })
          .limit(100)
          .lean();

        logger.info(`[Socket] Found ${missedMessages.length} missed messages`);

        if (callback) {
          callback({ 
            success: true, 
            messages: missedMessages 
          });
        }

      } catch (error) {
        logger.error(`Error syncing messages for ${socket.userId}:`, error);
        if (callback) {
          callback({ 
            success: false, 
            message: error.message || 'Đồng bộ tin nhắn thất bại.' 
          });
        }
      }
    });

    // Handle message read receipts
    socket.on('chat:markRead', async (data) => { // Đổi tên event từ chat:read sang chat:markRead để tránh nhầm lẫn
      try {
        const { messageIds, senderId } = data; // `senderId` ở đây là ID của người gửi tin nhắn gốc

        if (!Array.isArray(messageIds) || messageIds.length === 0) {
            socket.emit('chat:error', { message: 'Cần cung cấp ID tin nhắn để đánh dấu đã đọc.' });
            return;
        }

        // 1. Đánh dấu tin nhắn trong DB
        const updateResult = await chatService.markMessagesAsRead(socket.userId, messageIds);

        // 2. Thông báo cho người gửi tin nhắn (nếu họ online) rằng tin nhắn của họ đã được đọc
        if (updateResult.modifiedCount > 0) {
            const originalSenderSocketInfo = connectedUsers.get(senderId);
            if (originalSenderSocketInfo) {
                io.to(`user:${senderId}`).emit('chat:messageRead', { // Emit 'chat:messageRead'
                    messageIds: messageIds,
                    readBy: socket.userId, // Người đọc là người đang kết nối
                    readAt: new Date()
                });
            }
        }
      } catch (error) {
        logger.error(`Error marking messages as read for ${socket.userId}:`, error);
        socket.emit('chat:error', { message: error.message || 'Đánh dấu đã đọc thất bại.' });
      }
    });

    // Handle typing indicators
    socket.on('chat:typing:start', (data) => {
      const { conversationId } = data;
      // Gửi sự kiện typing đến tất cả những người khác trong phòng chat
      socket.to(`conversation:${conversationId}`).emit('chat:typing:start', {
        userId: socket.userId,
      });
    });

    socket.on('chat:typing:stop', (data) => {
      const { conversationId } = data;
      // Gửi sự kiện typing đến tất cả những người khác trong phòng chat
      socket.to(`conversation:${conversationId}`).emit('chat:typing:stop', {
        userId: socket.userId,
      });
    });

    // Handle interview signaling (GIỮ NGUYÊN NHƯ FILE GỐC CỦA BẠN)
    socket.on('interview:join', (data) => {
      const { roomId } = data;
      socket.join(`interview:${roomId}`);
      
      socket.to(`interview:${roomId}`).emit('interview:user-joined', {
        userId: socket.userId,
      });
    });

    socket.on('interview:leave', (data) => {
      const { roomId } = data;
      socket.leave(`interview:${roomId}`);
      
      socket.to(`interview:${roomId}`).emit('interview:user-left', {
        userId: socket.userId
      });
    });

    // WebRTC signaling for interviews (GIỮ NGUYÊN NHƯ FILE GỐC CỦA BẠN)
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

    // Handle notifications (GIỮ NGUYÊN NHƯ FILE GỐC CỦA BẠN)
    socket.on('notification:read', (data) => {
      const { notificationId } = data;
      // Update notification status (use your service here)
    });

    // Handle job alerts (GIỮ NGUYÊN NHƯ FILE GỐC CỦA BẠN)
    socket.on('job:alert:subscribe', (data) => {
      const { keywords } = data;
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
      logger.info(`User disconnected: ${socket.userId} from socket ID: ${socket.id}`);
      
      // Remove from connected users
      connectedUsers.delete(socket.userId);
      
      // Notify others user is offline
      io.emit('user:presence', {
        userId: socket.userId,
        isOnline: false
      });
    });

    // Handle errors from socket events
    socket.on('error', (error) => {
      logger.error(`Socket event error for user ${socket.userId}:`, error);
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
  // sendJobAlert // Giữ lại nếu bạn sử dụng
};
