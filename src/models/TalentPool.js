import mongoose from 'mongoose';

const talentPoolSchema = new mongoose.Schema({
  recruiterProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RecruiterProfile',
    required: [true, 'Recruiter profile reference is required']
  },
  candidateProfileId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateProfile',
    required: [true, 'Candidate profile reference is required']
  },
  applicationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: [true, 'Application reference is required']
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: [50, 'Tag cannot exceed 50 characters']
  }],
  notes: {
    type: String,
    trim: true,
    maxlength: [2000, 'Notes cannot exceed 2000 characters']
  },
  addedAt: {
    type: Date,
    default: Date.now
  },
  // Store snapshot of candidate info at time of addition
  candidateSnapshot: {
    name: String,
    email: String,
    phone: String,
    title: String,
    avatar: String,
    appliedJobTitle: String,
    appliedJobId: mongoose.Schema.Types.ObjectId
  }
}, {
  timestamps: true
});

// Indexes
talentPoolSchema.index({ recruiterProfileId: 1 });
talentPoolSchema.index({ candidateProfileId: 1 });
talentPoolSchema.index({ recruiterProfileId: 1, candidateProfileId: 1 }, { unique: true });
talentPoolSchema.index({ addedAt: -1 });
talentPoolSchema.index({ tags: 1 });

export default mongoose.model('TalentPool', talentPoolSchema);
