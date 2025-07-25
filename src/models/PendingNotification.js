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
    createdAt: { 
        type: Date, 
        default: Date.now,
        expires: '7d' // Tự động xóa các bản ghi chờ quá 7 ngày
    }
});

// Index để tối ưu query của Cron Job và tránh ghi trùng lặp
pendingNotificationSchema.index({ userId: 1, subscriptionId: 1 });
pendingNotificationSchema.index({ userId: 1, jobId: 1 }, { unique: true });

export default mongoose.model('PendingNotification', pendingNotificationSchema);
