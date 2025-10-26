import mongoose from 'mongoose';

const onboardingStepSchema = new mongoose.Schema({
  stepId: {
    type: Number,
    required: [true, 'Step ID is required'],
    min: [0, 'Step ID cannot be negative']
  },
  name: {
    type: String,
    required: [true, 'Step name is required'],
    trim: true,
    maxlength: [100, 'Step name cannot exceed 100 characters']
  },
  completed: {
    type: Boolean,
    default: false
  },
  skipped: {
    type: Boolean,
    default: false
  },
  data: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  },
  completedAt: {
    type: Date
  },
  skippedAt: {
    type: Date
  }
}, { _id: false });

const onboardingSessionSchema = new mongoose.Schema({
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CandidateProfile',
    required: [true, 'Candidate ID is required'],
    index: true
  },
  sessionId: {
    type: String,
    required: [true, 'Session ID is required'],
    unique: true,
    trim: true
  },
  steps: {
    type: [onboardingStepSchema],
    default: []
  },
  status: {
    type: String,
    enum: {
      values: ['in_progress', 'completed', 'abandoned'],
      message: '{VALUE} is not a valid onboarding status'
    },
    default: 'in_progress',
    index: true
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  completedAt: {
    type: Date
  },
  abandonedAt: {
    type: Date
  },
  metadata: {
    userAgent: { type: String, trim: true },
    ipAddress: { type: String, trim: true },
    deviceType: { type: String, trim: true }
  }
}, {
  timestamps: true
});

// Compound indexes for common queries
onboardingSessionSchema.index({ candidateId: 1, status: 1 });
onboardingSessionSchema.index({ candidateId: 1, startedAt: -1 });
onboardingSessionSchema.index({ status: 1, startedAt: -1 });

// TTL index to automatically delete abandoned sessions after 30 days
onboardingSessionSchema.index(
  { abandonedAt: 1 }, 
  { expireAfterSeconds: 2592000, partialFilterExpression: { status: 'abandoned' } }
);

const OnboardingSession = mongoose.model('OnboardingSession', onboardingSessionSchema);

export { OnboardingSession };
export default OnboardingSession;
