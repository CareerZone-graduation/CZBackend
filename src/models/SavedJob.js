import mongoose from 'mongoose';

/**
 * Saved Job Schema - Represents jobs saved by candidates
 * @typedef {Object} SavedJob
 * @property {ObjectId} candidate - Reference to Candidate
 * @property {ObjectId} job - Reference to Job
 * @property {Date} savedAt - When the job was saved
 */
const savedJobSchema = new mongoose.Schema({
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Candidate reference is required']
  },
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job reference is required']
  },
  savedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
savedJobSchema.index({ candidate: 1, job: 1 }, { unique: true }); // Prevent duplicate saves
savedJobSchema.index({ candidate: 1, savedAt: -1 });
savedJobSchema.index({ job: 1 });

export default mongoose.model('SavedJob', savedJobSchema);
