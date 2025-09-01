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
        "job_alert",
        "system",
        "job_applicants_rollup", // THÊM: Cho nhà tuyển dụng gộp nhóm.
      ],
      message: "{VALUE} is not a valid notification type",
    },
    required: [true, "Notification type is required"],
  },
  entity: {
    type: {
      type: String, // 'Application', 'Job', 'InterviewRoom', 'RecruiterProfile'
    },
    id: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  // --- TRƯỜNG MỚI ---
  aggregationKey: {
    type: String,
    sparse: true, // Chỉ index các document có trường này, tiết kiệm không gian
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: [true, "User reference is required"],
  },
}, { 
  timestamps: true
});

// BẮT BUỘC: Thêm indexes cho các trường thường xuyên được truy vấn
// --- INDEX MỚI QUAN TRỌNG ---
// Đảm bảo mỗi nhà tuyển dụng chỉ có 1 thông báo gộp cho 1 job
notificationSchema.index(
  { userId: 1, type: 1, aggregationKey: 1 }, 
  { 
    unique: true, 
    // Chỉ áp dụng unique index cho các document có tồn tại aggregationKey
    partialFilterExpression: { aggregationKey: { $exists: true } } 
  }
);

// Các index cũ giữ nguyên
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1 });
notificationSchema.index({ userId: 1, type: 1 });
notificationSchema.index({ type: 1 });
notificationSchema.index({ createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

// Tự động xóa thông báo sau 30 ngày (2592000 giây)
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 2592000 });

export default mongoose.model("Notification", notificationSchema);
