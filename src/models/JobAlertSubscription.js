import mongoose from 'mongoose';


const jobAlertSubscriptionSchema = new mongoose.Schema({
  candidateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Candidate reference is required']
  },
  keyword: {
    type: String,
    trim: true,
    maxlength: [100, 'Keyword cannot exceed 100 characters']
  },
  location: {
    city: {
      type: String,
      trim: true,
      maxlength: [100, 'City cannot exceed 100 characters']
    },
    district: {
      type: String,
      trim: true,
      maxlength: [100, 'District cannot exceed 100 characters']
    }
  },
  minSalary: {
    type: String,
    trim: true
  },
  maxSalary: {
    type: String,
    trim: true
  },
  type: {
    type: String,
    enum: {
      values: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE', 'ALL'],
      message: '{VALUE} is not a valid job type'
    }
  },
  workType: {
    type: String,
    enum: {
      values: ['ON_SITE', 'REMOTE', 'HYBRID', 'ALL'],
      message: '{VALUE} is not a valid work type'
    }
  },
  experience: {
    type: String,
    enum: {
      values: ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER', 'ALL'],
      message: '{VALUE} is not a valid experience level'
    }
  },
  category: {
    type: String,
    enum: {
      values: [
        'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
        'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
        'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
        'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
        'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER', 'ALL'
      ],
      message: '{VALUE} is not a valid job category'
    }
  },
  notificationMethod: {
    type: String,
    enum: {
      values: ['EMAIL', 'APPLICATION', 'BOTH'],
      message: '{VALUE} is not a valid notification method'
    },
    default: 'APPLICATION'
  },
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Create indexes for better query performance
jobAlertSubscriptionSchema.index({ candidateId: 1 });
jobAlertSubscriptionSchema.index({ keyword: 'text' });
jobAlertSubscriptionSchema.index({ active: 1 });
jobAlertSubscriptionSchema.index({ 'location.city': 1 });
jobAlertSubscriptionSchema.index({ type: 1 });
jobAlertSubscriptionSchema.index({ workType: 1 });
jobAlertSubscriptionSchema.index({ experience: 1 });
jobAlertSubscriptionSchema.index({ category: 1 });

// Compound indexes for finding matching subscriptions
jobAlertSubscriptionSchema.index({ active: 1, keyword: 'text', 'location.city': 1, type: 1, workType: 1, experience: 1, category: 1 });
jobAlertSubscriptionSchema.index({ candidateId: 1, active: 1 });

export default mongoose.model('JobAlertSubscription', jobAlertSubscriptionSchema);
