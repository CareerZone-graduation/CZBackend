import mongoose from 'mongoose';

const interviewRoomSchema = new mongoose.Schema({
  roomName: {
    type: String,
    required: [true, 'Room name is required'],
    trim: true,
    maxlength: [200, 'Room name cannot exceed 200 characters']
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
  
  scheduledTime: {//Đây là thời gian "chính thức" mà cả nhà tuyển dụng và ứng viên đã đồng ý.
    type: Date,
    required: [true, 'Scheduled time is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
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

export default mongoose.model('InterviewRoom', interviewRoomSchema);
