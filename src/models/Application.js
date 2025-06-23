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
  }
}, { _id: true });


const applicationSchema = new mongoose.Schema({
  coverLetter: {
    type: String,
    trim: true,
    maxlength: [2000, 'Cover letter cannot exceed 2000 characters']
  },
  appliedAt: {
    type: Date,
    default: Date.now
  },
  processed: {
    type: Boolean,
    default: false
  },
  submittedCV: submittedCV,
  job: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job reference is required']
  },
  candidate: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Candidate reference is required']
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
applicationSchema.index({ job: 1 });
applicationSchema.index({ candidate: 1 });
applicationSchema.index({ appliedAt: -1 });
applicationSchema.index({ processed: 1 });

// Compound indexes for common queries
applicationSchema.index({ job: 1, candidate: 1 }, { unique: true }); // Prevent duplicate applications
applicationSchema.index({ job: 1, processed: 1 });
applicationSchema.index({ candidate: 1, appliedAt: -1 });

export default mongoose.model('Application', applicationSchema);
