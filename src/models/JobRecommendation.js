import mongoose from 'mongoose';

const jobRecommendationSchema = new mongoose.Schema({
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateProfile',
    required: [true, 'Candidate ID is required'],
    index: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job ID is required'],
    index: true
  },
  score: {
    type: Number,
    min: 0,
    max: 100,
    required: [true, 'Score is required'],
    comment: 'Điểm phù hợp từ 0-100'
  },
  reasons: [{
    type: {
      type: String,
      enum: ['skill_match', 'location_match', 'salary_match', 'experience_match', 'work_type_match', 'contract_type_match'],
      required: true,
      comment: 'Loại lý do gợi ý'
    },
    value: {
      type: String,
      required: true,
      comment: 'Giá trị cụ thể của lý do (VD: tên skill, tên địa điểm)'
    },
    weight: {
      type: Number,
      min: 0,
      max: 100,
      required: true,
      comment: 'Trọng số đóng góp vào điểm tổng'
    }
  }],
  generatedAt: {
    type: Date,
    default: Date.now,
    comment: 'Thời điểm tạo gợi ý'
  },
  viewed: {
    type: Boolean,
    default: false,
    comment: 'Ứng viên đã xem job này chưa'
  },
  applied: {
    type: Boolean,
    default: false,
    comment: 'Ứng viên đã ứng tuyển job này chưa'
  }
}, {
  timestamps: true
});

// Compound indexes for efficient queries
jobRecommendationSchema.index({ candidateId: 1, score: -1 });
jobRecommendationSchema.index({ candidateId: 1, generatedAt: -1 });
jobRecommendationSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });

// TTL index to auto-delete old recommendations after 30 days
jobRecommendationSchema.index({ generatedAt: 1 }, { expireAfterSeconds: 2592000 });

export default mongoose.model('JobRecommendation', jobRecommendationSchema);
