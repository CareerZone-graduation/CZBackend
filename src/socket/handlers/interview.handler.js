import logger from '../../utils/logger.js';

export const registerInterviewHandlers = (io, socket, interviewRoomParticipants) => {
    // ============================================================
    // Interview Room Management Events
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
            const interviewService = await import('../../services/interview.service.js');
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

    // Handle media state changes (audio/video toggle)
    socket.on('interview:media-state', (data) => {
        try {
            const { roomId, isAudioEnabled, isVideoEnabled } = data;

            if (!roomId) {
                logger.warn(`Interview media state failed: Room ID is required`);
                return;
            }

            logger.info(`Media state from user ${socket.userId} in room ${roomId}: Audio=${isAudioEnabled}, Video=${isVideoEnabled}`);

            // Broadcast media state to other participants
            socket.to(`interview:${roomId}`).emit('interview:media-state', {
                userId: socket.userId,
                isAudioEnabled,
                isVideoEnabled,
                timestamp: new Date()
            });

        } catch (error) {
            logger.error(`Error handling media state from ${socket.userId}:`, error);
        }
    });

    // ============================================================
    // Interview Control Events
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
            const interviewService = await import('../../services/interview.service.js');
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
            const interviewService = await import('../../services/interview.service.js');
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
            const interviewService = await import('../../services/interview.service.js');
            const result = await interviewService.saveChatMessage(interviewId, socket.userId, message);

            logger.info(`Chat message sent in interview ${interviewId} by user ${socket.userId}`);

            // Broadcast message to other participants in the room
            socket.to(`interview:${roomId}`).emit('interview:chat-message', {
                _id: result.message._id,
                senderId: socket.userId,
                senderName: socket.user?.fullName || socket.user?.name || 'User',
                message: result.message.message,
                timestamp: result.message.timestamp
            });

            if (callback) callback({ success: true, message: result.message });

        } catch (error) {
            logger.error(`Error sending chat message from ${socket.userId}:`, error);
            if (callback) callback({ success: false, error: error.message });
        }
    });

    // Handle emoji reactions
    socket.on('interview:emoji', (data) => {
        try {
            const { roomId, emoji } = data;
            if (!roomId || !emoji) return;

            // Broadcast emoji to other participants
            socket.to(`interview:${roomId}`).emit('interview:emoji', {
                userId: socket.userId,
                emoji,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error(`Error sending emoji from ${socket.userId}:`, error);
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
            const interviewService = await import('../../services/interview.service.js');
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
};
