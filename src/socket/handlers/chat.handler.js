import logger from '../../utils/logger.js';
import * as chatService from '../../services/chat.service.js';

export const registerChatHandlers = (io, socket, connectedUsers) => {
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

            // 3. Check messaging access based on roles
            if (socket.user.role === 'recruiter' && conversationDoc.otherParticipant.role === 'candidate') {
                // Recruiter messaging candidate
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
            } else if (socket.user.role === 'candidate' && conversationDoc.otherParticipant.role === 'recruiter') {
                // Candidate messaging recruiter - check reverse access
                const accessCheck = await chatService.checkMessagingAccess(recipientId, socket.userId);

                if (!accessCheck.canMessage) {
                    logger.warn(`Access denied: Candidate ${socket.userId} cannot message recruiter ${recipientId}. Reason: ${accessCheck.reason}`);
                    if (callback) callback({
                        success: false,
                        message: 'Bạn không có quyền gửi tin nhắn cho nhà tuyển dụng này.',
                        tempMessageId,
                        reasonCode: accessCheck.reason
                    });
                    return;
                }

                logger.info(`Access granted: Candidate ${socket.userId} can message recruiter ${recipientId}. Reason: ${accessCheck.reason}`);
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
            if (tempMessageId) {
                messageObject.tempMessageId = tempMessageId;
            }

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

            // 7. Phát sự kiện tin nhắn mới đến cả người nhận và người gửi (để đồng bộ trên các thiết bị khác)
            // Emit to recipient's personal room
            io.to(`user:${recipientId}`).emit('message:new', messageObject);

            // Emit to sender's personal room (for other tabs/devices)
            // We use io.to instead of socket.to to ensure it goes to all sender's sockets including the current one if needed
            // But usually current one is handled by callback/optimistic UI. 
            // To avoid duplication in current socket, frontend should handle it by checking tempMessageId or _id
            io.to(`user:${socket.userId}`).emit('message:new', messageObject);

            logger.info(`[Socket] Message sent successfully from ${socket.userId} to ${recipientId} in conversation ${conversationId}`);

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
            const ChatMessage = (await import('../../models/ChatMessage.js')).default;
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
};
