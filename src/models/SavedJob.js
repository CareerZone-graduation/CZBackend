import mongoose from 'mongoose';


const savedJobSchema = new mongoose.Schema({
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Candidate reference is required']
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job reference is required']
  }
},  {
  timestamps: { createdAt: true, updatedAt: false }
});

// Create indexes for better query performance
savedJobSchema.index({ candidateId: 1, jobId: 1 }, { unique: true }); // Prevent duplicate saves
savedJobSchema.index({ candidateId: 1, createdAt: -1 });
savedJobSchema.index({ jobId: 1 });

export default mongoose.model('SavedJob', savedJobSchema);
