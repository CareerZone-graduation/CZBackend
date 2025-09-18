import mongoose from 'mongoose';

const notificationHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User reference is required'],
    index: true
  },
  subscriptionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'JobAlertSubscription',
    required: [true, 'Subscription reference is required'],
    index: true
  },
  notificationType: {
    type: String,
    required: [true, 'Notification type is required'],
    enum: {
      values: ['DAILY', 'WEEKLY'],
      message: '{VALUE} is not a valid notification type'
    },
    index: true
  },
  jobIds: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true
  }],
  deliveryMethod: {
    type: String,
    required: [true, 'Delivery method is required'],
    enum: {
      values: ['EMAIL', 'APPLICATION', 'BOTH'],
      message: '{VALUE} is not a valid delivery method'
    }
  },
  sentAt: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true
});

// Indexes for performance optimization
notificationHistorySchema.index({ userId: 1, sentAt: -1 });
notificationHistorySchema.index({ subscriptionId: 1, sentAt: -1 });
notificationHistorySchema.index({ status: 1, sentAt: -1 });
notificationHistorySchema.index({ notificationType: 1, sentAt: -1 });
notificationHistorySchema.index({ userId: 1, notificationType: 1, sentAt: -1 });

// Compound index for analytics queries
notificationHistorySchema.index({ 
  userId: 1, 
  notificationType: 1, 
  status: 1, 
  sentAt: -1 
});

export default mongoose.model('NotificationHistory', notificationHistorySchema);