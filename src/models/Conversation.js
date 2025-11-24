// src/models/Conversation.js
import mongoose from 'mongoose';

const conversationSchema = new mongoose.Schema({
  // Người tham gia thứ nhất (luôn có ID nhỏ hơn)
  participant1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Người tham gia thứ hai (luôn có ID lớn hơn)
  participant2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // ID của tin nhắn cuối cùng trong cuộc trò chuyện này
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ChatMessage',
    default: null
  },
  // Thời gian của tin nhắn cuối cùng
  lastMessageAt: {
    type: Date,
    default: Date.now
  },
  // Ngữ cảnh của cuộc trò chuyện
  context: {
    type: {
      type: String,
      enum: ['APPLICATION', 'PROFILE_UNLOCK'],
      default: null
    },
    contextId: {
      type: mongoose.Schema.Types.ObjectId,
      default: null
    },
    applicationIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Application'
    }],
    title: {
      type: String,
      default: null
    },
    attachedAt: {
      type: Date,
      default: Date.now
    }
  }
}, {
  timestamps: true
});

// Validation để đảm bảo participant1 luôn nhỏ hơn participant2
conversationSchema.pre('save', function (next) {
  if (this.participant1.toString() === this.participant2.toString()) {
    return next(new Error('Không thể tạo cuộc trò chuyện với chính mình'));
  }

  // Đảm bảo participant1 luôn nhỏ hơn participant2
  if (this.participant1.toString() > this.participant2.toString()) {
    [this.participant1, this.participant2] = [this.participant2, this.participant1];
  }

  next();
});

// Index duy nhất cho cặp participant1, participant2
conversationSchema.index({ participant1: 1, participant2: 1 }, { unique: true });
// Index để tìm cuộc trò chuyện theo từng người tham gia
conversationSchema.index({ participant1: 1, lastMessageAt: -1 });
conversationSchema.index({ participant2: 1, lastMessageAt: -1 });
conversationSchema.index({ 'context.contextId': 1 });

export default mongoose.model('Conversation', conversationSchema);
