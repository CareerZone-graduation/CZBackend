// src/socket/index.js
import jwt from 'jsonwebtoken';
import config from '../config/index.js';
import logger from '../utils/logger.js';
import { User } from '../models/index.js';
import * as chatService from '../services/chat.service.js';

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

    // ============================================================
    // Interview Room Management Events (Task 5.3)
    // ============================================================
    
    socket.on('interview:join', async (data, callback) => {
      try {
        const { roomId, interviewId } = data;
        
        if (!roomId || !interviewId) {
          const error = { message: 'Room ID and Interview ID are required' };
          logger.warn(`Interview join failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          socket.emit('interview:error', error);
          return;
        }

        logger.info(`User ${socket.userId} attempting to join interview ${interviewId}, roomId: ${roomId}`);

        // Validate access and time window using interview service
        const interviewService = await import('../services/interview.service.js');
        const joinResult = await interviewService.joinInterview(interviewId, socket.userId);
        
        if (!joinResult.canJoin) {
          const error = { message: 'Cannot join interview at this time' };
          logger.warn(`User ${socket.userId} cannot join interview ${interviewId}`);
          if (callback) callback({ success: false, error: error.message });
          socket.emit('interview:error', error);
          return;
        }

        const roomName = `interview:${roomId}`;
        
        // === FIX: CLEANUP GHOST STATES ===
        // Initialize room participants set if not exists
        if (!interviewRoomParticipants.has(roomId)) {
          interviewRoomParticipants.set(roomId, new Set());
        }
        
        // Get actual sockets in room from Socket.IO
        const socketsInRoomBefore = await io.in(roomName).fetchSockets();
        const actualSocketIds = new Set(socketsInRoomBefore.map(s => s.id));
        const actualUserIds = new Set(socketsInRoomBefore.map(s => s.userId));
        
        // Clean up our tracking map - remove users who are not actually connected
        const trackedUsers = interviewRoomParticipants.get(roomId);
        for (const userId of trackedUsers) {
          if (!actualUserIds.has(userId)) {
            logger.info(`[CLEANUP] Removing ghost user ${userId} from room ${roomId}`);
            trackedUsers.delete(userId);
          }
        }
        
        logger.info(`[BEFORE JOIN] Room ${roomName} has ${socketsInRoomBefore.length} actual sockets`);
        logger.info(`[BEFORE JOIN] Tracked participants:`, Array.from(trackedUsers));
        
        // Build existing users list with cleaned data
        const existingUsers = socketsInRoomBefore
          .filter(s => s.userId !== socket.userId) // Exclude current user
          .map(s => ({
            userId: s.userId,
            socketId: s.id,
            userRole: s.userRole || 'unknown',
            userName: s.user?.fullName || s.user?.name || 'User'
          }));
        
        logger.info(`[BEFORE JOIN] Existing users in room:`, existingUsers);

        // === Now join the interview room ===
        socket.join(roomName);
        socket.interviewId = interviewId;
        socket.userRole = joinResult.userRole;
        
        // Add to our tracking
        trackedUsers.add(socket.userId);
        
        logger.info(`User ${socket.userId} (${joinResult.userRole}) joined interview room: ${roomName}`);
        logger.info(`[AFTER JOIN] Room ${roomName} now has ${trackedUsers.size} tracked participants`);
        
        // Notify other participants that new user joined
        const userJoinedEvent = {
          userId: socket.userId,
          userName: socket.user?.fullName || socket.user?.name || 'User',
          userRole: joinResult.userRole,
          timestamp: new Date(),
          // Signal to initiator (recruiter) to send offer if this is candidate joining
          shouldInitiateOffer: joinResult.userRole === 'candidate' && existingUsers.some(u => u.userRole === 'recruiter')
        };
        
        socket.to(roomName).emit('interview:user-joined', userJoinedEvent);
        logger.info(`Emitted user-joined event to ${existingUsers.length} users in room ${roomName}:`, userJoinedEvent);

        // Send success callback with existing users info
        if (callback) {
          const response = {
            success: true, 
            roomId: roomId,
            interview: joinResult.interview,
            userRole: joinResult.userRole,
            existingUsers: existingUsers, // Send cleaned list
            participantsCount: trackedUsers.size
          };
          logger.info(`Sending join response to user ${socket.userId}:`, response);
          callback(response);
        }

      } catch (error) {
        logger.error(`Error joining interview for user ${socket.userId}:`, error);
        const errorMessage = error.message || 'Failed to join interview';
        if (callback) callback({ success: false, error: errorMessage });
        socket.emit('interview:error', { message: errorMessage });
      }
    });

    socket.on('interview:leave', (data) => {
      const { roomId, interviewId } = data;
      const id = roomId || interviewId;
      
      if (!id) {
        logger.warn(`Interview leave failed: Room ID or Interview ID is required`);
        socket.emit('interview:error', { message: 'Room ID or Interview ID is required' });
        return;
      }

      const roomName = `interview:${id}`;
      socket.leave(roomName);
      logger.info(`User ${socket.userId} (${socket.userRole}) left interview room: ${roomName}`);
      
      // Notify other participants
      socket.to(roomName).emit('interview:user-left', {
        userId: socket.userId,
        userName: socket.user?.fullName || socket.user?.name || 'User',
        userRole: socket.userRole,
        timestamp: new Date()
      });
    });

    // ============================================================
    // WebRTC Signaling Events (Native WebRTC - No simple-peer)
    // ============================================================
    
    // Handle WebRTC offer (from Recruiter to Candidate)
    socket.on('interview:offer', async (data, callback) => {
      try {
        const { roomId, interviewId, offer, to } = data;
        const actualRoomId = interviewId || roomId;
        
        if (!actualRoomId || !offer) {
          const error = { message: 'Interview ID and offer are required' };
          logger.warn(`Interview offer failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        logger.info(`[OFFER] From user ${socket.userId} in room ${actualRoomId}`);
        
        // Forward offer to specific user or broadcast to room
        if (to) {
          logger.info(`[OFFER] Forwarding to specific user: ${to}`);
          io.to(`user:${to}`).emit('interview:offer', {
            from: socket.userId,
            offer,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        } else {
          logger.info(`[OFFER] Broadcasting to room (excluding sender)`);
          socket.to(`interview:${actualRoomId}`).emit('interview:offer', {
            from: socket.userId,
            offer,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        }

        if (callback) callback({ success: true });

      } catch (error) {
        logger.error(`Error handling interview offer from ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle WebRTC answer (from Candidate to Recruiter)
    socket.on('interview:answer', async (data, callback) => {
      try {
        const { roomId, interviewId, answer, to } = data;
        const actualRoomId = interviewId || roomId;
        
        if (!actualRoomId || !answer) {
          const error = { message: 'Interview ID and answer are required' };
          logger.warn(`Interview answer failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        logger.info(`[ANSWER] From user ${socket.userId} in room ${actualRoomId}`);
        
        // Forward answer to specific user or broadcast to room
        if (to) {
          logger.info(`[ANSWER] Forwarding to specific user: ${to}`);
          io.to(`user:${to}`).emit('interview:answer', {
            from: socket.userId,
            answer,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        } else {
          logger.info(`[ANSWER] Broadcasting to room (excluding sender)`);
          socket.to(`interview:${actualRoomId}`).emit('interview:answer', {
            from: socket.userId,
            answer,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        }

        if (callback) callback({ success: true });

      } catch (error) {
        logger.error(`Error handling interview answer from ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle ICE candidate
    socket.on('interview:ice-candidate', async (data, callback) => {
      try {
        const { roomId, interviewId, candidate, to } = data;
        const actualRoomId = interviewId || roomId;
        
        if (!actualRoomId || !candidate) {
          const error = { message: 'Interview ID and candidate are required' };
          logger.warn(`Interview ICE candidate failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        logger.info(`[ICE] From user ${socket.userId} in room ${actualRoomId}`);
        
        // Forward ICE candidate to specific user or broadcast to room
        if (to) {
          logger.info(`[ICE] Forwarding to specific user: ${to}`);
          io.to(`user:${to}`).emit('interview:ice-candidate', {
            from: socket.userId,
            candidate,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        } else {
          logger.info(`[ICE] Broadcasting to room (excluding sender)`);
          socket.to(`interview:${actualRoomId}`).emit('interview:ice-candidate', {
            from: socket.userId,
            candidate,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        }

        if (callback) callback({ success: true });

      } catch (error) {
        logger.error(`Error handling ICE candidate from ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle unified WebRTC signal (offer, answer, or ICE candidate)
    socket.on('interview:signal', async (data, callback) => {
      try {
        const { roomId, interviewId, signal, to } = data;
        const actualRoomId = interviewId || roomId;
        
        if (!actualRoomId || !signal) {
          const error = { message: 'Interview ID and signal are required' };
          logger.warn(`Interview signal failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        const signalType = signal.type || 'candidate';
        logger.info(`[SIGNAL] ${signalType} from user ${socket.userId} in room ${actualRoomId}`);
        
        // Forward signal to specific user or broadcast to room
        if (to) {
          logger.info(`[SIGNAL] Forwarding ${signalType} to specific user: ${to}`);
          io.to(`user:${to}`).emit('interview:signal', {
            from: socket.userId,
            fromUserId: socket.userId,
            signal,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        } else {
          logger.info(`[SIGNAL] Broadcasting ${signalType} to room (excluding sender)`);
          socket.to(`interview:${actualRoomId}`).emit('interview:signal', {
            from: socket.userId,
            fromUserId: socket.userId,
            signal,
            roomId: actualRoomId,
            interviewId: actualRoomId
          });
        }

        if (callback) callback({ success: true });

      } catch (error) {
        logger.error(`Error handling interview signal from ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle connection state monitoring
    socket.on('interview:connection-state', (data) => {
      try {
        const { roomId, state, quality } = data;
        
        if (!roomId || !state) {
          logger.warn(`Interview connection state failed: Room ID and state are required`);
          return;
        }

        logger.info(`Connection state from user ${socket.userId} in room ${roomId}: ${state}`);
        
        // Broadcast connection state to other participants
        socket.to(`interview:${roomId}`).emit('interview:connection-state', {
          userId: socket.userId,
          state,
          quality,
          timestamp: new Date()
        });

      } catch (error) {
        logger.error(`Error handling connection state from ${socket.userId}:`, error);
      }
    });

    // ============================================================
    // Interview Control Events (Task 5.2)
    // ============================================================
    
    // Handle recording start notification
    socket.on('interview:start-recording', async (data, callback) => {
      try {
        const { roomId, interviewId } = data;
        
        if (!roomId || !interviewId) {
          const error = { message: 'Room ID and Interview ID are required' };
          logger.warn(`Start recording failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        // Verify user is the recruiter
        const interviewService = await import('../services/interview.service.js');
        const accessCheck = await interviewService.checkInterviewAccess(interviewId, socket.userId);
        
        if (!accessCheck.isRecruiter) {
          const error = { message: 'Only recruiter can start recording' };
          logger.warn(`User ${socket.userId} attempted to start recording without permission`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        logger.info(`Recording started in interview ${interviewId} by recruiter ${socket.userId}`);
        
        // Notify all participants that recording has started
        io.to(`interview:${roomId}`).emit('interview:recording-started', {
          startedBy: socket.userId,
          timestamp: new Date()
        });

        if (callback) callback({ success: true });

      } catch (error) {
        logger.error(`Error starting recording for user ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle recording stop notification
    socket.on('interview:stop-recording', async (data, callback) => {
      try {
        const { roomId, interviewId } = data;
        
        if (!roomId || !interviewId) {
          const error = { message: 'Room ID and Interview ID are required' };
          logger.warn(`Stop recording failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        // Verify user is the recruiter
        const interviewService = await import('../services/interview.service.js');
        const accessCheck = await interviewService.checkInterviewAccess(interviewId, socket.userId);
        
        if (!accessCheck.isRecruiter) {
          const error = { message: 'Only recruiter can stop recording' };
          logger.warn(`User ${socket.userId} attempted to stop recording without permission`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        logger.info(`Recording stopped in interview ${interviewId} by recruiter ${socket.userId}`);
        
        // Notify all participants that recording has stopped
        io.to(`interview:${roomId}`).emit('interview:recording-stopped', {
          stoppedBy: socket.userId,
          timestamp: new Date()
        });

        if (callback) callback({ success: true });

      } catch (error) {
        logger.error(`Error stopping recording for user ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle real-time chat messages during interview
    socket.on('interview:chat-message', async (data, callback) => {
      try {
        const { roomId, interviewId, message } = data;
        
        if (!roomId || !interviewId || !message) {
          const error = { message: 'Room ID, Interview ID, and message are required' };
          logger.warn(`Interview chat message failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        // Save message to database
        const interviewService = await import('../services/interview.service.js');
        const result = await interviewService.saveChatMessage(interviewId, socket.userId, message);

        logger.info(`Chat message sent in interview ${interviewId} by user ${socket.userId}`);
        
        // Broadcast message to other participants in the room
        socket.to(`interview:${roomId}`).emit('interview:chat-message', {
          _id: result.message._id,
          senderId: socket.userId,
          message: result.message.message,
          timestamp: result.message.timestamp
        });

        if (callback) callback({ success: true, message: result.message });

      } catch (error) {
        logger.error(`Error sending chat message from ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

    // Handle interview end event
    socket.on('interview:end', async (data, callback) => {
      try {
        const { roomId, interviewId } = data;
        
        if (!roomId || !interviewId) {
          const error = { message: 'Room ID and Interview ID are required' };
          logger.warn(`End interview failed: ${error.message}`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        // Verify user has permission (recruiter or candidate can end)
        const interviewService = await import('../services/interview.service.js');
        const accessCheck = await interviewService.checkInterviewAccess(interviewId, socket.userId);
        
        if (!accessCheck.hasAccess) {
          const error = { message: 'You do not have permission to end this interview' };
          logger.warn(`User ${socket.userId} attempted to end interview without permission`);
          if (callback) callback({ success: false, error: error.message });
          return;
        }

        logger.info(`Interview ${interviewId} ended by user ${socket.userId}`);
        
        // Notify all participants that interview has ended
        io.to(`interview:${roomId}`).emit('interview:ended', {
          endedBy: socket.userId,
          timestamp: new Date()
        });

        // Remove all users from the interview room
        const socketsInRoom = await io.in(`interview:${roomId}`).fetchSockets();
        for (const socketInRoom of socketsInRoom) {
          socketInRoom.leave(`interview:${roomId}`);
        }

        if (callback) callback({ success: true });

      } catch (error) {
        logger.error(`Error ending interview for user ${socket.userId}:`, error);
        if (callback) callback({ success: false, error: error.message });
      }
    });

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
    socket.on('disconnect', async () => {
      logger.info(`User disconnected: ${socket.userId} from socket ID: ${socket.id}`);
      
      // Remove from connected users
      connectedUsers.delete(socket.userId);
      
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
      
      // Notify others user is offline (general presence)
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
