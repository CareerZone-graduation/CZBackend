import mongoose from 'mongoose';


const jobSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'Job title is required'],
    trim: true,
    maxlength: [200, 'Job title cannot exceed 200 characters']
  },
  description: {
    type: String,
    required: [true, 'Job description is required'],
    trim: true,
    maxlength: [5000, 'Job description cannot exceed 5000 characters']
  },
  location: {
    type: String,
    required: [true, 'Job location is required'],
    trim: true,
    maxlength: [200, 'Location cannot exceed 200 characters']
  },
  type: {
    type: String,
    enum: {
      values: ['FULL_TIME', 'PART_TIME', 'CONTRACT', 'INTERNSHIP', 'TEMPORARY', 'VOLUNTEER', 'FREELANCE'],
      message: '{VALUE} is not a valid job type'
    },
    required: [true, 'Job type is required']
  },
  minSalary: {
    type: String,
    trim: true
  },
  maxSalary: {
    type: String,
    trim: true
  },
  deadline: {
    type: Date,
    required: [true, 'Application deadline is required'],
    validate: {
      validator: function(value) {
        return value > new Date();
      },
      message: 'Deadline must be in the future'
    }
  },
  experience: {
    type: String,
    enum: {
      values: ['ENTRY_LEVEL', 'MID_LEVEL', 'SENIOR_LEVEL', 'EXECUTIVE', 'NO_EXPERIENCE', 'INTERN', 'FRESHER'],
      message: '{VALUE} is not a valid experience level'
    },
    required: [true, 'Experience level is required']
  },
  category: {
    type: String,
    enum: {
      values: [
        'IT', 'SOFTWARE_DEVELOPMENT', 'DATA_SCIENCE', 'MACHINE_LEARNING', 'WEB_DEVELOPMENT',
        'SALES', 'MARKETING', 'ACCOUNTING', 'GRAPHIC_DESIGN', 'CONTENT_WRITING',
        'MEDICAL', 'TEACHING', 'ENGINEERING', 'PRODUCTION', 'LOGISTICS',
        'HOSPITALITY', 'REAL_ESTATE', 'LAW', 'FINANCE', 'HUMAN_RESOURCES',
        'CUSTOMER_SERVICE', 'ADMINISTRATION', 'MANAGEMENT', 'OTHER'
      ],
      message: '{VALUE} is not a valid job category'
    },
    required: [true, 'Job category is required']
  },
  area: {
    type: String,
    trim: true,
    maxlength: [100, 'Area cannot exceed 100 characters']
  },
  active: {
    type: Boolean,
    default: true
  },
  approved: {
    type: Boolean,
    default: false
  },
  company: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Company',
    required: [true, 'Company reference is required']
  }
}, {
  timestamps: true
});

// Create indexes for better search and query performance
jobSchema.index({ title: 'text', description: 'text', location: 'text' });
jobSchema.index({ company: 1 });
jobSchema.index({ type: 1 });
jobSchema.index({ category: 1 });
jobSchema.index({ experience: 1 });
jobSchema.index({ active: 1, approved: 1 });
jobSchema.index({ deadline: 1 });
jobSchema.index({ createdAt: -1 });

// Compound indexes for common queries
jobSchema.index({ active: 1, approved: 1, deadline: 1 });
jobSchema.index({ category: 1, type: 1, active: 1 });

export default mongoose.model('Job', jobSchema);
