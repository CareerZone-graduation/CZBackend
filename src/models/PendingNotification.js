// src/models/PendingNotification.js
import mongoose from 'mongoose';

const pendingNotificationSchema = new mongoose.Schema({
    userId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User', 
        required: true 
    },
    jobId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'Job', 
        required: true 
    },
    subscriptionId: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'JobAlertSubscription', 
        required: true 
    },
    matchingSubscriptionIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'JobAlertSubscription'
    }],
    processed: {
        type: Boolean,
        default: false,
        index: true
    },
    processedAt: {
        type: Date,
        index: true
    },
    createdAt: { 
        type: Date, 
        default: Date.now,
        expires: '7d' // Tự động xóa các bản ghi chờ quá 7 ngày
    }
});

// Enhanced indexes for performance optimization
pendingNotificationSchema.index({ userId: 1, subscriptionId: 1 });
pendingNotificationSchema.index({ userId: 1, jobId: 1 }, { unique: true });
pendingNotificationSchema.index({ processed: 1, createdAt: 1 });
pendingNotificationSchema.index({ userId: 1, processed: 1 });

export default mongoose.model('PendingNotification', pendingNotificationSchema);
