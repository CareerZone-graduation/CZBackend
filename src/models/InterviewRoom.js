import mongoose from 'mongoose';

// Chat message schema for interview transcript
const chatMessageSchema = new mongoose.Schema({
  senderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Sender ID is required']
  },
  message: {
    type: String,
    required: [true, 'Message content is required'],
    trim: true,
    maxlength: [2000, 'Message cannot exceed 2000 characters']
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}); // Removed { _id: false } to allow Mongoose to auto-generate _id for each message

// Recording information schema
const recordingSchema = new mongoose.Schema({
  enabled: {
    type: Boolean,
    default: false
  },
  url: {
    type: String,
    trim: true
  },
  duration: {
    type: Number,
    min: [0, 'Duration cannot be negative'],
    comment: 'Recording duration in seconds'
  },
  size: {
    type: Number,
    min: [0, 'Size cannot be negative'],
    comment: 'File size in bytes'
  }
}, { _id: false });

const interviewRoomSchema = new mongoose.Schema({
  roomName: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [200, 'Room name cannot exceed 200 characters']
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job'
  },
  recruiterId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recruiter ID is required']
  },
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Candidate ID is required']
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  roomId: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    comment: 'Unique identifier for WebRTC room'
  },
  
  meetingUrl: {
    type: String,
    trim: true,
    comment: 'URL for the online meeting room'
  },
  meetingProvider: {
    type: String,
    trim: true,
    default: 'Jitsi',
    comment: 'The provider of the meeting service (e.g., Jitsi, Google Meet)'
  },

  scheduledTime: {//Đây là thời gian "chính thức" mà cả nhà tuyển dụng và ứng viên đã đồng ý.
    type: Date,
    required: [true, 'Scheduled time is required'],
    validate: {
      validator: function(value) {
        // Only validate future time when creating new interview
        // Allow past times for existing interviews (e.g., when updating chat transcript)
        if (this.isNew) {
          return value > new Date();
        }
        return true;
      },
      message: 'Scheduled time must be in the future'
    }
  },
  startTime: { //Mặc dù lịch là 10:00 sáng (scheduledTime), nhưng đến 10:05 sáng nhà tuyển dụng mới nhấn nút "Bắt đầu phỏng vấn" trong hệ thống. startTime sẽ được ghi nhận là 10:05
    type: Date
  },
  endTime: { //Ví dụ: Buổi phỏng vấn kết thúc lúc 10:47 sáng. endTime sẽ được ghi nhận là 10:47.
    //Mục đích chính: Ghi log và tính toán thời lượng thực tế của buổi phỏng vấn (bằng cách lấy endTime - startTime). Điều này hữu ích cho việc báo cáo và phân tích hiệu suất.
    type: Date
  },
  status: {
    type: String,
    enum: {
      values: ['SCHEDULED', 'STARTED', 'COMPLETED', 'CANCELLED', 'RESCHEDULED'],
      message: '{VALUE} is not a valid interview status'
    },
    default: 'SCHEDULED'
  },
  changeHistory: [{
    timestamp: {
      type: Date,
      default: Date.now
    },
    action: {
      type: String,
      required: true,
      enum: ['CREATED', 'RESCHEDULED', 'CANCELLED', 'STARTED', 'COMPLETED', 'NOTE_ADDED']
    },
    fromTime: {
      type: Date // Thời gian cũ (dành cho RESCHEDULED)
    },
    toTime: {
      type: Date // Thời gian mới (dành cho RESCHEDULED)
    },
    reason: {
      type: String,
      trim: true,
      maxlength: [500, 'Reason cannot exceed 500 characters']
    },
    notes: {
      type: String,
      trim: true,
      maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    actor: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    }
  }],
  isReminderSent: {
    type: Boolean,
    default: false // Cờ để đánh dấu đã gửi thông báo nhắc nhở hay chưa
  },
  // WebRTC interview fields
  duration: {
    type: Number,
    default: 60,
    min: [15, 'Duration must be at least 15 minutes'],
    max: [180, 'Duration cannot exceed 180 minutes'],
    comment: 'Expected duration in minutes'
  },
  recording: {
    type: recordingSchema,
    default: () => ({})
  },
  chatTranscript: {
    type: [chatMessageSchema],
    default: []
  }
}, {
  timestamps: true // Tự động thêm createdAt và updatedAt
});

// ================================= Indexes =================================
// Các index giúp tăng tốc độ truy vấn dữ liệu thường xuyên.

// Index để tìm các cuộc phỏng vấn của một nhà tuyển dụng, sắp xếp theo thời gian
interviewRoomSchema.index({ recruiterId: 1, scheduledTime: 1 });
// Index để tìm các cuộc phỏng vấn của một ứng viên, sắp xếp theo thời gian
interviewRoomSchema.index({ candidateId: 1, scheduledTime: 1 });
// Index để tìm phỏng vấn dựa trên đơn ứng tuyển
interviewRoomSchema.index({ applicationId: 1 });
// Index để lọc phỏng vấn theo trạng thái
interviewRoomSchema.index({ status: 1 });
// Index để sắp xếp các cuộc phỏng vấn theo thời gian
interviewRoomSchema.index({ scheduledTime: 1 });
// Index phức hợp phục vụ cho cron job nhắc lịch phỏng vấn:
// - `status`: Chỉ tìm các cuộc phỏng vấn 'SCHEDULED'.
// - `isReminderSent`: Chỉ tìm những cuộc chưa gửi lời nhắc.
// - `scheduledTime`: Tìm trong một khoảng thời gian cụ thể.
interviewRoomSchema.index({ status: 1, scheduledTime: 1, isReminderSent: 1 });
// Index for job reference
interviewRoomSchema.index({ jobId: 1 });

// ================================= Virtual Properties =================================
// Virtual property to check if interview is currently active
interviewRoomSchema.virtual('isActive').get(function() {
  return this.status === 'STARTED';
});

// ================================= Instance Methods =================================
// Instance method to check if a user can join the interview
interviewRoomSchema.methods.canUserJoin = function(userId) {
  const userIdStr = userId.toString();
  
  // Check if user is a participant (recruiter or candidate)
  const isParticipant = 
    this.recruiterId.toString() === userIdStr || 
    this.candidateId.toString() === userIdStr;
  
  // Check if interview is in valid status
  const isScheduledOrStarted = 
    this.status === 'SCHEDULED' || 
    this.status === 'STARTED';
  
  // Check if current time is within the allowed time window
  const isWithinTimeWindow = () => {
    const now = new Date();
    const scheduledTime = new Date(this.scheduledTime);
    
    // Allow joining 15 minutes before scheduled time
    const windowStart = new Date(scheduledTime.getTime() - 15 * 60000);
    
    // Allow joining up to 30 minutes after scheduled time
    const windowEnd = new Date(scheduledTime.getTime() + 30 * 60000);
    
    return now >= windowStart && now <= windowEnd;
  };
  
  return isParticipant && isScheduledOrStarted && isWithinTimeWindow();
};

// Ensure virtuals are included when converting to JSON
interviewRoomSchema.set('toJSON', { virtuals: true });
interviewRoomSchema.set('toObject', { virtuals: true });

export default mongoose.model('InterviewRoom', interviewRoomSchema);
