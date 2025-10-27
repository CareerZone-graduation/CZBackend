import mongoose from 'mongoose';

const jobViewHistorySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User ID is required']
  },
  jobId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Job',
    required: [true, 'Job ID is required']
  },
  viewedAt: {
    type: Date,
    required: [true, 'Viewed timestamp is required'],
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for better query performance
jobViewHistorySchema.index({ userId: 1, viewedAt: -1 }); // Query user history sorted by time
jobViewHistorySchema.index({ jobId: 1 }); // Stats per job
jobViewHistorySchema.index({ viewedAt: 1 }); // For cleanup/expiration

// Compound index to prevent duplicate entries
// User can view same job multiple times but we'll update viewedAt
jobViewHistorySchema.index(
  { 
    userId: 1, 
    jobId: 1
  },
  { unique: true }
);

// Pre-save middleware to update viewedAt if entry already exists
jobViewHistorySchema.pre('save', function(next) {
  this.viewedAt = new Date();
  next();
});

// Static method to create or update view history
jobViewHistorySchema.statics.recordView = async function(userId, jobId) {
  try {
    const result = await this.findOneAndUpdate(
      { userId, jobId },
      { 
        $set: { viewedAt: new Date() },
        $setOnInsert: { userId, jobId }
      },
      { 
        upsert: true, 
        new: true,
        runValidators: true
      }
    );
    return result;
  } catch (error) {
    throw error;
  }
};

// Static method to get user's view history with pagination
jobViewHistorySchema.statics.getUserHistory = async function(userId, { page = 1, limit = 10 } = {}) {
  const skip = (page - 1) * limit;
  
  const [data, total] = await Promise.all([
    this.find({ userId })
      .sort({ viewedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'jobId',
        // Populate recruiter info via recruiterProfileId and select needed job fields
        select: 'title location minSalary maxSalary workType skills status recruiterProfileId',
        populate: {
          path: 'recruiterProfileId',
          select: 'company'
        }
      })
      .lean(),
    this.countDocuments({ userId })
  ]);

  return {
    data,
    pagination: {
      currentPage: page,
      totalPages: Math.ceil(total / limit),
      totalItems: total,
      limit
    }
  };
};

// Static method to get view statistics
jobViewHistorySchema.statics.getUserStats = async function(userId) {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [total, thisWeek, thisMonth, uniqueJobs] = await Promise.all([
    this.countDocuments({ userId }),
    this.countDocuments({ userId, viewedAt: { $gte: weekAgo } }),
    this.countDocuments({ userId, viewedAt: { $gte: monthAgo } }),
    this.distinct('jobId', { userId }).then(jobs => jobs.length)
  ]);

  return {
    totalViews: total,
    viewsThisWeek: thisWeek,
    viewsThisMonth: thisMonth,
    uniqueJobs
  };
};

// Static method to delete old history (optional cleanup)
jobViewHistorySchema.statics.cleanupOldHistory = async function(daysToKeep = 180) {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);
  
  const result = await this.deleteMany({ viewedAt: { $lt: cutoffDate } });
  return result.deletedCount;
};

const JobViewHistory = mongoose.model('JobViewHistory', jobViewHistorySchema);

export { JobViewHistory };
export default JobViewHistory;
