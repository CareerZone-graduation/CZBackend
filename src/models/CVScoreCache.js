import mongoose from 'mongoose';

const cvScoreCacheSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: true,
    index: true
  },
  cvSource: {
    type: String,
    enum: ['UPLOADED', 'TEMPLATE'],
    required: true
  },
  cvId: {
    type: String,
    required: true
  },
  cvFingerprint: {
    type: String,
    required: true
  },
  jobFingerprint: {
    type: String,
    required: true
  },
  scoringResult: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  metadata: {
    cvName: String,
    jobTitle: String
  },
  scoredAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

cvScoreCacheSchema.index(
  { userId: 1, jobId: 1, cvSource: 1, cvId: 1, cvFingerprint: 1, jobFingerprint: 1 },
  { unique: true }
);

export default mongoose.model('CVScoreCache', cvScoreCacheSchema);
