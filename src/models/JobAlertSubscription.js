import mongoose from 'mongoose';

/**
 * Job Alert Subscription Schema - Represents user subscriptions to job alerts
 * @typedef {Object} JobAlertSubscription
 * @property {ObjectId} candidate - Reference to Candidate
 * @property {string} keyword - Search keyword for job alerts
 * @property {string} notificationMethod - How to deliver notifications (EMAIL, WEBSOCKET, BOTH)
 * @property {boolean} active - Whether subscription is active
 */
const jobAlertSubscriptionSchema = new mongoose.Schema({
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Candidate reference is required']
  },
  keyword: {
    type: String,
    required: [true, 'Keyword is required'],
    trim: true,
    maxlength: [100, 'Keyword cannot exceed 100 characters']
  },
  notificationMethod: {
    type: String,
    enum: {
      values: ['EMAIL', 'WEBSOCKET', 'BOTH'],
      message: '{VALUE} is not a valid notification method'
    },
    default: 'EMAIL'
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
jobAlertSubscriptionSchema.index({ candidate: 1 });
jobAlertSubscriptionSchema.index({ keyword: 'text' });
jobAlertSubscriptionSchema.index({ active: 1 });

// Compound index for finding matching subscriptions
jobAlertSubscriptionSchema.index({ active: 1, keyword: 'text' });

export default mongoose.model('JobAlertSubscription', jobAlertSubscriptionSchema);
