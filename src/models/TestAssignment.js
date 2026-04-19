import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
  questionId: { type: mongoose.Schema.Types.ObjectId, required: true },
  selectedOptionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  isCorrect: { type: Boolean, default: false },
  scoreEarned: { type: Number, default: 0 }
}, { _id: false });

const testAssignmentSchema = new mongoose.Schema({
  testId: { type: mongoose.Schema.Types.ObjectId, ref: 'Test', required: true },
  applicationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Application', required: true },
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  status: { type: String, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED'], default: 'PENDING' },
  assignedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  startedAt: { type: Date, default: null },
  completedAt: { type: Date, default: null },
  score: { type: Number, default: 0 },
  totalScore: { type: Number, default: 0 },
  passed: { type: Boolean, default: false },
  answers: { type: [answerSchema], default: [] },
  timeSpent: { type: Number, default: 0 }
}, { timestamps: true });

testAssignmentSchema.index({ applicationId: 1 });
testAssignmentSchema.index({ candidateId: 1, status: 1 });

export default mongoose.model('TestAssignment', testAssignmentSchema);
