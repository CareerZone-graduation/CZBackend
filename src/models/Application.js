import mongoose from 'mongoose';

// ĐỊNH NGHĨA SCHEMA CHO MỘT MỤC LỊCH SỬ HOẠT ĐỘNG
const activityLogSchema = new mongoose.Schema({
  action: {
    type: String,
    enum: [
      'APPLICATION_SUBMITTED', // khi ứng viên nộp đơn
      'INTERVIEW_RESCHEDULED', // khi người tuyển dụng thay đổi lịch phỏng vấn
      'INTERVIEW_CANCELLED', // khi người tuyển dụng hủy phỏng vấn
      'INTERVIEW_COMPLETED', // khi người ứng tuyển hoàn thành phỏng vấn
      'APPLICATION_VIEWED', // khi nhà tuyển dụng xem hồ sơ lần đầu
      'SUITABLE', // khi người tuyển dụng đánh giá hồ sơ
      'SCHEDULED_INTERVIEW', // khi người tuyển dụng đặt lịch phỏng vấn
      'OFFER_SENT', // khi người tuyển dụng gửi lời mời
      'OFFER_ACCEPTED', // khi người ứng tuyển chấp nhận lời mời
      'OFFER_DECLINED', // khi người ứng tuyển từ chối lời mời
      'REJECTED' // khi người tuyển dụng từ chối ứng viên
    ],
    required: true
  },
  detail: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  }
}, { _id: false });

const submittedCV = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'CV name is required'],
    trim: true,
    maxlength: [200, 'CV name cannot exceed 200 characters']
  },
  path: {
    type: String,
    // Không bắt buộc nữa vì CV template không có path
    trim: true
  },
  cloudinaryId: {
    type: String,
    trim: true
  },
  source: {
    type: String,
    enum: ['UPLOADED', 'TEMPLATE'],
    required: [true, 'CV source is required']
  },
  // ===== Các trường dành cho CV template (source = 'TEMPLATE') =====
  // ID của CV template gốc để tham chiếu
  cvTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CV'
  },
  // Snapshot toàn bộ dữ liệu CV tại thời điểm ứng tuyển (để không bị thay đổi theo CV gốc)
  templateSnapshot: {
    type: mongoose.Schema.Types.Mixed
  },
  // Template ID (modern-blue, classic-white, etc.)
  templateId: {
    type: String,
    trim: true
  }
}, { _id: false });


const applicationSchema = new mongoose.Schema({
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job reference is required']
  },
  candidateProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateProfile',
    required: [true, 'Candidate reference is required']
  },
  coverLetter: {
    type: String,
    trim: true,
    maxlength: [2000, 'Cover letter cannot exceed 2000 characters']
  },
  appliedAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: {
      values: [
        'PENDING', //default when application is created
        'SUITABLE', //perform by recruiter
        'SCHEDULED_INTERVIEW', //perform by recruiter
        'OFFER_SENT', //perform by recruiter
        'ACCEPTED', //perform by candidate
        'REJECTED', //perform by recruiter
        'OFFER_DECLINED' //perform by candidate
      ],
      message: '{VALUE} is not a valid application status'
    },
    default: 'PENDING',
    required: [true, 'Application status is required']
  },
  lastStatusUpdateAt: {
    type: Date,
    default: Date.now
  },
  isReapplied: {
    type: Boolean,
    default: false
  },
  isDeclineByCandidate: {
    type: Boolean,
    default: false
  },
  previousApplicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  // Thông tin người ứng tuyển (nhập từ form)
  candidateName: {
    type: String,
    trim: true,
    maxlength: [100, 'Tên không thể vượt quá 100 ký tự']
  },
  candidateEmail: {
    type: String,
    trim: true,
    match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Email không hợp lệ']
  },
  candidatePhone: {
    type: String,
    trim: true,
    match: [/^[\+]?[\d]{1,15}$/, 'Số điện thoại không hợp lệ']
  },
  submittedCV: submittedCV,
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },
  jobSnapshot: {
    title: {
      type: String,
      required: [true, 'Job title is required'],
      trim: true,
      maxlength: [200, 'Job title cannot exceed 200 characters']
    },
    company: {
      type: String,
      required: [true, 'Company name is required'],
      trim: true,
      maxlength: [200, 'Company name cannot exceed 200 characters']
    },
    logo: {
      type: String,
      required: [true, 'Company logo is required'],
      trim: true
    }
  },
  // THÊM MẢNG LỊCH SỬ HOẠT ĐỘNG
  activityHistory: {
    type: [activityLogSchema],
    default: []
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
applicationSchema.index({ jobId: 1 });
applicationSchema.index({ candidateProfileId: 1 });
applicationSchema.index({ appliedAt: -1 });
applicationSchema.index({ status: 1 }); // Index for status

// Compound indexes for common queries
applicationSchema.index({ jobId: 1, candidateProfileId: 1 }, {
  unique: true,
  partialFilterExpression: { isReapplied: { $ne: true } }
}); // Prevent duplicate applications except reapplications
applicationSchema.index({ jobId: 1, status: 1 });
applicationSchema.index({ candidateProfileId: 1, appliedAt: -1 });
applicationSchema.index({ status: 1, appliedAt: -1 }); // Compound index for status and appliedAt
applicationSchema.index({ lastStatusUpdateAt: -1 }); // Index for sorting by status update time

export default mongoose.model('Application', applicationSchema);
