import mongoose from 'mongoose';

const optionSchema = new mongoose.Schema({
  text: { type: String, required: true },
  isCorrect: { type: Boolean, default: false }
}, { _id: true });

const questionSchema = new mongoose.Schema({
  type: { type: String, enum: ['MULTIPLE_CHOICE'], required: true, default: 'MULTIPLE_CHOICE' },
  question: { type: String, required: true, trim: true },
  score: { type: Number, required: true, min: 1 },
  options: { type: [optionSchema], default: [] }
}, { _id: true });

const testSchema = new mongoose.Schema({
  companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'RecruiterProfile', required: true },
  name: { type: String, required: true, trim: true, maxlength: 200 },
  description: { type: String, default: '' },
  duration: { type: Number, required: true, min: 1 },
  passingScore: { type: Number, required: true, min: 0 },
  totalScore: { type: Number, default: 0 },
  questions: { type: [questionSchema], default: [] },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  usageCount: { type: Number, default: 0 }
}, { timestamps: true });

testSchema.index({ companyId: 1, createdAt: -1 });

export default mongoose.model('Test', testSchema);
