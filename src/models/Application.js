import mongoose from 'mongoose';


const submittedCV = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'CV name is required'],
    trim: true,
    maxlength: [200, 'CV name cannot exceed 200 characters']
  },
  path: {
    type: String,
    required: [true, 'CV path is required'],
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
  // Chỉ tồn tại khi source là 'TEMPLATE'
  templateSnapshot: {
    type: mongoose.Schema.Types.Mixed
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
      values: ['PENDING', 'REVIEWING', 'INTERVIEWED', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
      message: '{VALUE} is not a valid application status'
    },
    default: 'PENDING',
    required: [true, 'Application status is required']
  },
  lastStatusUpdateAt: {
    type: Date,
    default: Date.now
  },
  candidateRating: {
    type: String,
    enum: {
      values: ['NOT_RATED', 'NOT_SUITABLE', 'MAYBE', 'SUITABLE', 'PERFECT_MATCH'],
      message: '{VALUE} is not a valid candidate rating'
    },
    default: 'NOT_RATED'
  },
  isReapplied: {
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
}, {
  timestamps: true
});

// Create indexes for better query performance
applicationSchema.index({ jobId: 1 });
applicationSchema.index({ candidateProfileId: 1 });
applicationSchema.index({ appliedAt: -1 });
applicationSchema.index({ status: 1 }); // Index for status

// Compound indexes for common queries
applicationSchema.index({ jobId: 1, candidateProfileId: 1 }, { unique: true, 
  partialFilterExpression: { isReapplied: { $ne: true } } }); // Prevent duplicate applications except reapplications
applicationSchema.index({ jobId: 1, status: 1 });
applicationSchema.index({ candidateProfileId: 1, appliedAt: -1 });
applicationSchema.index({ status: 1, appliedAt: -1 }); // Compound index for status and appliedAt
applicationSchema.index({ jobId: 1, candidateRating: 1 }); // Index for candidate rating
applicationSchema.index({ lastStatusUpdateAt: -1 }); // Index for sorting by status update time

export default mongoose.model('Application', applicationSchema);
