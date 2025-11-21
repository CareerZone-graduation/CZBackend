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
    lowercase: true,
    required: [true, 'Keyword is required'],
    maxlength: [50, 'Keyword cannot exceed 50 characters'],
    validate: {
      validator: function(value) {
        // Kiểm tra keyword chỉ có 1 từ (không có khoảng trắng)
        return value && value.trim().split(/\s+/).length === 1;
      },
      message: 'Keyword must be a single word without spaces'
    }
  },
  location: {
    province: {
      type: String,
      required: [true, 'Province is required'],
    },
    district: {
      type: String,
      required: [true, 'District is required'],
    }
  },
  frequency: {
    type: String,
    required: [true, 'Frequency is required'],
    enum: {
      values: ['daily', 'weekly'],
      message: '{VALUE} is not a valid frequency'
    },
    default: 'weekly'
  },
  salaryRange: {
    type: String,
    required: [true, 'Salary range is required'],
    enum: {
      values: ['UNDER_10M', '10M_20M', '20M_30M', 'OVER_30M', 'ALL'],
      message: '{VALUE} is not a valid salary range'
    }
  },
  type: {
    type: String,
    required: [true, 'Job type is required'],
    enum: {
      values: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE', 'ALL'],
      message: '{VALUE} is not a valid job type'
    }
  },
  workType: {
    type: String,
    required: [true, 'Work type is required'],
    enum: {
      values: ['ON_SITE', 'REMOTE', 'HYBRID', 'ALL'],
      message: '{VALUE} is not a valid work type'
    }
  },
  experience: {
    type: String,
    required: [true, 'Experience level is required'],
    enum: {
      values: ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER', 'ALL'],
      message: '{VALUE} is not a valid experience level'
    }
  },
  category: {
    type: String,
    required: [true, 'Category is required'],
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
  lastNotificationSent: {
    type: Date,
    index: true
  },
  // Subscription management fields
  active: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes for performance optimization
jobAlertSubscriptionSchema.index({ candidateId: 1, active: 1, frequency: 1 });
jobAlertSubscriptionSchema.index({ keyword: 1, active: 1 });
jobAlertSubscriptionSchema.index({ lastNotificationSent: 1, frequency: 1 });

export default mongoose.model('JobAlertSubscription', jobAlertSubscriptionSchema);
