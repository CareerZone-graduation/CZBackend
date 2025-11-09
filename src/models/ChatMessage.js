import mongoose from 'mongoose';


const chatMessageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation', // Tham chiếu đến Conversation model
    required: [true, 'Conversation ID is required']
  },
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  recipientId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required']
  },
  content: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [1000, 'Message content cannot exceed 1000 characters']
  },
  sentAt: {
    type: Date,
    default: Date.now
  },
  readAt: {
    type: Date,
    default: null
  },
  isRead: {
    type: Boolean,
    default: false
  },
  attachments: [{
    type: String,
    validate: {
      validator: function(v) {
        return /^https?:\/\/.+\.(jpg|jpeg|png|gif|pdf|docx?|xlsx?)$/.test(v);
      },
      message: props => `${props.value} is not a valid attachment URL`
    }
  }],
  status: {
    type: String,
    enum: {
      values: ['SENT', 'DELIVERED', 'READ'],
      message: '{VALUE} is not a valid message status'
    },
    default: 'SENT'
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
chatMessageSchema.index({ conversationId: 1, createdAt: -1 }); // For retrieving messages in a conversation, ordered by newest first
chatMessageSchema.index({ conversationId: 1, sentAt: 1 }); // For syncing missed messages after reconnection
chatMessageSchema.index({ senderId: 1, recipientId: 1, createdAt: -1 }); // For messages sent from sender to recipient
chatMessageSchema.index({ recipientId: 1, senderId: 1, createdAt: -1 }); // For messages sent from recipient to sender (to cover both directions of a conversation)
chatMessageSchema.index({ recipientId: 1, isRead: 1 }); // For finding unread messages for a recipient
chatMessageSchema.index({ status: 1, createdAt: -1 }); // For general status queries

export default mongoose.model('ChatMessage', chatMessageSchema);
