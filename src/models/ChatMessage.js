import mongoose from 'mongoose';


const chatMessageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender is required']
  },
  recipient: {
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
  timestamp: {
    type: Date,
    default: Date.now
  },
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
chatMessageSchema.index({ sender: 1, recipient: 1, timestamp: -1 });
chatMessageSchema.index({ recipient: 1, status: 1 });
chatMessageSchema.index({ timestamp: -1 });

// Compound index for conversation queries
chatMessageSchema.index({
  $or: [
    { sender: 1, recipient: 1 },
    { sender: 1, recipient: 1 }
  ]
});

export default mongoose.model('ChatMessage', chatMessageSchema);
