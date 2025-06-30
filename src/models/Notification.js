import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, "Notification title is required"],
    trim: true,
    maxlength: [200, "Title cannot exceed 200 characters"],
  },
  message: {
    type: String,
    required: [true, "Notification message is required"],
    trim: true,
    maxlength: [1000, "Message cannot exceed 1000 characters"],
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  isRead: {
    type: Boolean,
    default: false,
  },
  readAt: {
    type: Date
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  type: {
    type: String,
    enum: {
      values: [
        "application",
        "interview",
        "recommendation",
        "profile_view",
        "profile_update",
        "job_alert",
        "system",
      ],
      message: "{VALUE} is not a valid notification type",
    },
    required: [true, "Notification type is required"],
  },
  entity: {
    type: {
      type: String, // 'Application', 'Job', 'InterviewRoom'
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User reference is required"],
  },
});

// Create indexes for better query performance
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });
export default mongoose.model("Notification", notificationSchema);
